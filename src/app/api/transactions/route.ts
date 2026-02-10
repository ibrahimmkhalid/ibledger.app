import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

type TransactionLineInput = {
  walletId?: number | null;
  fundId?: number | null;
  description?: string | null;
  amount: number;
  isPending: boolean;
};

function parseOccurredAt(input: unknown): Date {
  if (input instanceof Date) {
    return input;
  }

  if (typeof input === "string") {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new Error("Invalid occurredAt");
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const pageParam = searchParams.get("page");
    const page = pageParam ? Number(pageParam) : 0;

    const pendingOnly = searchParams.get("pendingOnly") === "true";

    if (Number.isNaN(page) || page < 0) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    const pageSize = 20;

    const events = await db
      .select({
        id: transactions.id,
        occurredAt: transactions.occurredAt,
        description: transactions.description,
        amount: transactions.amount,
        isPosting: transactions.isPosting,
        isPending: transactions.isPending,
        incomePull: transactions.incomePull,
        walletId: transactions.walletId,
        walletName: wallets.name,
        fundId: transactions.fundId,
        fundName: funds.name,
      })
      .from(transactions)
      .leftJoin(wallets, eq(wallets.id, transactions.walletId))
      .leftJoin(funds, eq(funds.id, transactions.fundId))
      .where(
        pendingOnly
          ? and(
              eq(transactions.userId, user.id),
              isNull(transactions.parentId),
              isNull(transactions.deletedAt),
              eq(transactions.isPending, true),
            )
          : and(
              eq(transactions.userId, user.id),
              isNull(transactions.parentId),
              isNull(transactions.deletedAt),
            ),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .offset(page * pageSize)
      .limit(pageSize);

    // when isPosting is false, it means that the event is a parent event
    const parentEventIds = events.filter((e) => !e.isPosting).map((e) => e.id);

    const children =
      parentEventIds.length === 0
        ? []
        : await db
            .select({
              id: transactions.id,
              parentId: transactions.parentId,
              occurredAt: transactions.occurredAt,
              description: transactions.description,
              isPending: transactions.isPending,
              amount: transactions.amount,
              incomePull: transactions.incomePull,
              walletId: transactions.walletId,
              walletName: wallets.name,
              fundId: transactions.fundId,
              fundName: funds.name,
            })
            .from(transactions)
            .leftJoin(wallets, eq(wallets.id, transactions.walletId))
            .leftJoin(funds, eq(funds.id, transactions.fundId))
            .where(
              and(
                eq(transactions.userId, user.id),
                eq(transactions.isPosting, true),
                inArray(transactions.parentId, parentEventIds),
                isNull(transactions.deletedAt),
              ),
            )
            .orderBy(desc(transactions.id));

    const childrenByParentId = new Map<number, typeof children>();
    for (const child of children) {
      const pid = child.parentId;
      if (!pid) {
        continue;
      }
      const list = childrenByParentId.get(pid) ?? [];
      list.push(child);
      childrenByParentId.set(pid, list);
    }

    const response = events.map((event) => ({
      ...event,
      children: childrenByParentId.get(event.id) ?? [],
    }));

    return NextResponse.json({
      events: response,
      currentPage: page,
      nextPage: events.length === pageSize ? page + 1 : -1,
    });
  } catch (error) {
    console.error("API: Error fetching transactions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await request.json();

    const occurredAt = parseOccurredAt(body?.occurredAt);
    const description = body?.description ? String(body.description) : null;
    const eventIsPending =
      body?.isPending === undefined ? true : Boolean(body.isPending);

    const type = body?.type ? String(body.type) : "expense";

    if (type === "income") {
      // Ensure we can find the required system savings fund.
      const userFunds = await db
        .select({
          id: funds.id,
          isSavings: funds.isSavings,
          pullPercentage: funds.pullPercentage,
        })
        .from(funds)
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

      const savingsFundId = userFunds.find((f) => Boolean(f.isSavings))?.id;

      if (!savingsFundId) {
        return NextResponse.json(
          {
            error: "Missing savings fund. Call POST /api/bootstrap first.",
          },
          { status: 400 },
        );
      }

      const walletId = Number(body?.walletId);
      const amount = Number(body?.amount);
      const isPending = eventIsPending;

      if (!walletId || Number.isNaN(walletId)) {
        return NextResponse.json(
          { error: "Missing walletId" },
          { status: 400 },
        );
      }

      if (!amount || Number.isNaN(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "Income amount must be > 0" },
          { status: 400 },
        );
      }

      const ownedWallet = await db
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(
            eq(wallets.id, walletId),
            eq(wallets.userId, user.id),
            isNull(wallets.deletedAt),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!ownedWallet) {
        return NextResponse.json(
          { error: "Wallet not found" },
          { status: 404 },
        );
      }

      const normalizedPulls = userFunds
        .filter((f) => !f.isSavings)
        .map((f) => ({
          destFundId: f.id,
          percentage: Number(f.pullPercentage ?? 0),
        }))
        .filter((p) => p.percentage > 0);

      const pullSum = normalizedPulls.reduce(
        (acc: number, p: { destFundId: number; percentage: number }) =>
          acc + p.percentage,
        0,
      );

      if (pullSum > 100) {
        return NextResponse.json(
          { error: "Invalid fund pulls: sum exceeds 100" },
          { status: 400 },
        );
      }

      const parent = await db
        .insert(transactions)
        .values({
          userId: user.id,
          parentId: null,
          occurredAt,
          description,
          isPosting: false,
          isPending: eventIsPending,
          incomePull: null,
          fundId: null,
          walletId: null,
          amount: 0,
        })
        .returning()
        .then((res) => res[0]);

      if (!parent) {
        return NextResponse.json(
          { error: "Failed to create event" },
          { status: 500 },
        );
      }

      let allocatedTotal = 0;
      const postingRows: Array<typeof transactions.$inferInsert> = [];

      for (const pull of normalizedPulls) {
        const allocated = (amount * pull.percentage) / 100;
        allocatedTotal += allocated;
        postingRows.push({
          userId: user.id,
          parentId: parent.id,
          occurredAt,
          description: null,
          isPosting: true,
          isPending,
          incomePull: pull.percentage,
          walletId,
          fundId: pull.destFundId,
          amount: allocated,
        });
      }

      const savingsPullPct = 100 - pullSum;
      const savingsAllocated = amount - allocatedTotal;
      postingRows.push({
        userId: user.id,
        parentId: parent.id,
        occurredAt,
        description: null,
        isPosting: true,
        isPending,
        incomePull: savingsPullPct,
        walletId,
        fundId: savingsFundId,
        amount: savingsAllocated,
      });

      await db.insert(transactions).values(postingRows);

      return NextResponse.json({ eventId: parent.id });
    }

    const lines = Array.isArray(body?.lines) ? body.lines : null;
    if (!lines || lines.length === 0) {
      return NextResponse.json({ error: "Missing lines" }, { status: 400 });
    }

    const parsedLines: TransactionLineInput[] = lines.map((l: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const line: any = l;
      const amount = Number(line.amount);
      const walletId =
        line.walletId === null || line.walletId === undefined
          ? null
          : Number(line.walletId);
      const fundId =
        line.fundId === null || line.fundId === undefined
          ? null
          : Number(line.fundId);
      const isPending =
        line.isPending === undefined ? eventIsPending : Boolean(line.isPending);
      const description =
        line.description === undefined || line.description === null
          ? null
          : String(line.description);

      if (Number.isNaN(amount) || amount === 0) {
        throw new Error("Invalid amount");
      }

      if (walletId !== null && Number.isNaN(walletId)) {
        throw new Error("Invalid walletId");
      }

      if (fundId !== null && Number.isNaN(fundId)) {
        throw new Error("Invalid fundId");
      }

      if (walletId === null && fundId === null) {
        throw new Error("Line must include walletId or fundId");
      }

      return { walletId, fundId, description, amount, isPending };
    });

    const neededWalletIds = Array.from(
      new Set(
        parsedLines.map((l) => l.walletId).filter((id): id is number => !!id),
      ),
    );
    const neededFundIds = Array.from(
      new Set(
        parsedLines.map((l) => l.fundId).filter((id): id is number => !!id),
      ),
    );

    if (neededWalletIds.length > 0) {
      const ownedWallets = await db
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(
            eq(wallets.userId, user.id),
            inArray(wallets.id, neededWalletIds),
            isNull(wallets.deletedAt),
          ),
        );

      if (ownedWallets.length !== neededWalletIds.length) {
        return NextResponse.json(
          { error: "One or more wallets not found" },
          { status: 400 },
        );
      }
    }

    const fundRows =
      neededFundIds.length === 0
        ? []
        : await db
            .select({ id: funds.id })
            .from(funds)
            .where(
              and(
                eq(funds.userId, user.id),
                inArray(funds.id, neededFundIds),
                isNull(funds.deletedAt),
              ),
            );

    if (fundRows.length !== neededFundIds.length) {
      return NextResponse.json(
        { error: "One or more funds not found" },
        { status: 400 },
      );
    }

    // If this is a single-line event, store it as a posting-only event
    // (no child rows) to reduce inserts.
    if (parsedLines.length === 1) {
      const line = parsedLines[0];
      const posting = await db
        .insert(transactions)
        .values({
          userId: user.id,
          parentId: null,
          occurredAt,
          description,
          isPosting: true,
          isPending: line.isPending,
          incomePull: null,
          walletId: line.walletId ?? null,
          fundId: line.fundId ?? null,
          amount: line.amount,
        })
        .returning()
        .then((res) => res[0]);

      if (!posting) {
        return NextResponse.json(
          { error: "Failed to create event" },
          { status: 500 },
        );
      }

      return NextResponse.json({ eventId: posting.id });
    }

    const parent = await db
      .insert(transactions)
      .values({
        userId: user.id,
        parentId: null,
        occurredAt,
        description,
        isPosting: false,
        isPending: eventIsPending,
        incomePull: null,
        fundId: null,
        walletId: null,
        amount: 0,
      })
      .returning()
      .then((res) => res[0]);

    if (!parent) {
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 },
      );
    }

    await db.insert(transactions).values(
      parsedLines.map((line) => ({
        userId: user.id,
        parentId: parent.id,
        occurredAt,
        description: line.description ?? null,
        isPosting: true,
        isPending: line.isPending,
        incomePull: null,
        walletId: line.walletId ?? null,
        fundId: line.fundId ?? null,
        amount: line.amount,
      })),
    );

    return NextResponse.json({ eventId: parent.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    if (
      message.startsWith("Invalid") ||
      message.includes("Line must") ||
      message.includes("Fund not found")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("API: Error creating transaction", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
