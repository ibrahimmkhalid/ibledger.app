import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { fundFeeds, funds, transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

type TransactionLineInput = {
  walletId?: number | null;
  fundId?: number | null;
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

async function getFundBalanceAsOf(args: {
  userId: number;
  fundId: number;
  occurredAt: Date;
}): Promise<number> {
  const { userId, fundId, occurredAt } = args;

  const row = await db
    .select({
      openingAmount: funds.openingAmount,
      delta: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.as("delta"),
    })
    .from(funds)
    .leftJoin(
      transactions,
      and(
        eq(transactions.userId, userId),
        eq(transactions.fundId, fundId),
        eq(transactions.status, "posted"),
        eq(transactions.isPosting, true),
        isNull(transactions.deletedAt),
        lte(transactions.occurredAt, occurredAt),
      ),
    )
    .where(
      and(
        eq(funds.id, fundId),
        eq(funds.userId, userId),
        isNull(funds.deletedAt),
      ),
    )
    .groupBy(funds.id, funds.openingAmount)
    .limit(1)
    .then((res) => res[0]);

  if (!row) {
    throw new Error("Fund not found");
  }

  return Number(row.openingAmount) + Number(row.delta);
}

export async function GET(request: NextRequest) {
  try {
    const pageParam = new URL(request.url).searchParams.get("page");
    const page = pageParam ? Number(pageParam) : 0;

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
        isPending: transactions.isPending,
        status: transactions.status,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.isPosting, false),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .offset(page * pageSize)
      .limit(pageSize);

    const eventIds = events.map((e) => e.id);

    const children =
      eventIds.length === 0
        ? []
        : await db
            .select({
              id: transactions.id,
              parentId: transactions.parentId,
              occurredAt: transactions.occurredAt,
              description: transactions.description,
              isPending: transactions.isPending,
              status: transactions.status,
              amount: transactions.amount,
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
                inArray(transactions.parentId, eventIds),
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

    const parent = await db
      .insert(transactions)
      .values({
        userId: user.id,
        parentId: null,
        occurredAt,
        description,
        status: "posted",
        isPosting: false,
        isPending: eventIsPending,
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

    const type = body?.type ? String(body.type) : "expense";

    // Ensure we can find required system funds
    const userFunds = await db
      .select({ id: funds.id, kind: funds.kind })
      .from(funds)
      .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

    const incomeFundId = userFunds.find((f) => f.kind === "income")?.id;
    const savingsFundId = userFunds.find((f) => f.kind === "savings")?.id;

    if (!incomeFundId || !savingsFundId) {
      return NextResponse.json(
        {
          error: "Missing income/savings fund. Call POST /api/bootstrap first.",
        },
        { status: 400 },
      );
    }

    if (type === "income") {
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

      const pulls = await db
        .select({
          destFundId: fundFeeds.dest,
          percentage: fundFeeds.feedPercentage,
        })
        .from(fundFeeds)
        .where(eq(fundFeeds.source, incomeFundId));

      const normalizedPulls = pulls
        .filter((p) => p.destFundId !== savingsFundId)
        .map((p) => ({
          destFundId: p.destFundId,
          percentage: Number(p.percentage),
        }));

      const pullSum = normalizedPulls.reduce(
        (acc: number, p: { destFundId: number; percentage: number }) =>
          acc + p.percentage,
        0,
      );

      if (pullSum > 100) {
        return NextResponse.json(
          { error: "Invalid fund feeds: sum exceeds 100" },
          { status: 400 },
        );
      }

      // 1) wallet deposit (wallet-only)
      await db.insert(transactions).values({
        userId: user.id,
        parentId: parent.id,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        isPending,
        walletId,
        fundId: null,
        amount,
      });

      // 2) fund allocations (fund-only)
      let allocatedTotal = 0;
      for (const pull of normalizedPulls) {
        const allocated = (amount * pull.percentage) / 100;
        allocatedTotal += allocated;

        await db.insert(transactions).values({
          userId: user.id,
          parentId: parent.id,
          occurredAt,
          description: null,
          status: "posted",
          isPosting: true,
          isPending,
          walletId: null,
          fundId: pull.destFundId,
          amount: allocated,
        });
      }

      const savingsAllocated = amount - allocatedTotal;

      await db.insert(transactions).values({
        userId: user.id,
        parentId: parent.id,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        isPending,
        walletId: null,
        fundId: savingsFundId,
        amount: savingsAllocated,
      });

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

      return { walletId, fundId, amount, isPending };
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
            .select({ id: funds.id, kind: funds.kind })
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

    const fundKindById = new Map<number, string>(
      fundRows.map((f) => [f.id, f.kind]),
    );

    // Overspend: regular funds should never go negative.
    const fundBalanceCache = new Map<number, number>();

    for (const line of parsedLines) {
      if (line.fundId) {
        const fundKind = fundKindById.get(line.fundId);

        if (fundKind === "regular") {
          const balanceBefore =
            fundBalanceCache.get(line.fundId) ??
            (await getFundBalanceAsOf({
              userId: user.id,
              fundId: line.fundId,
              occurredAt,
            }));

          const balanceAfter = balanceBefore + line.amount;

          await db.insert(transactions).values({
            userId: user.id,
            parentId: parent.id,
            occurredAt,
            description: null,
            status: "posted",
            isPosting: true,
            isPending: line.isPending,
            walletId: line.walletId ?? null,
            fundId: line.fundId,
            amount: line.amount,
          });

          if (balanceAfter < 0) {
            const deficit = -balanceAfter;

            await db.insert(transactions).values({
              userId: user.id,
              parentId: parent.id,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId: line.fundId,
              amount: deficit,
            });

            await db.insert(transactions).values({
              userId: user.id,
              parentId: parent.id,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId: savingsFundId,
              amount: -deficit,
            });

            fundBalanceCache.set(line.fundId, 0);
          } else {
            fundBalanceCache.set(line.fundId, balanceAfter);
          }

          continue;
        }
      }

      // Non-regular fund line, or no fund: just insert.
      await db.insert(transactions).values({
        userId: user.id,
        parentId: parent.id,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        isPending: line.isPending,
        walletId: line.walletId ?? null,
        fundId: line.fundId ?? null,
        amount: line.amount,
      });
    }

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
