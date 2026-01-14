import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { fundFeeds, funds, transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

type TransactionLineInput = {
  walletId?: number | null;
  fundId?: number | null;
  amount: number;
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

async function ensureSystemFunds(args: { userId: number }) {
  const userFunds = await db
    .select({ id: funds.id, kind: funds.kind })
    .from(funds)
    .where(and(eq(funds.userId, args.userId), isNull(funds.deletedAt)));

  const incomeFundId = userFunds.find((f) => f.kind === "income")?.id;
  const savingsFundId = userFunds.find((f) => f.kind === "savings")?.id;

  if (!incomeFundId || !savingsFundId) {
    throw new Error("Missing income/savings fund");
  }

  return { incomeFundId, savingsFundId };
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
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

    const { incomeFundId, savingsFundId } = await ensureSystemFunds({
      userId: user.id,
    });

    const params = await ctx.params;
    const eventId = Number(params.id);
    if (!eventId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const parent = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, eventId),
          eq(transactions.userId, user.id),
          eq(transactions.isPosting, false),
          isNull(transactions.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!parent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await request.json();

    const occurredAt = parseOccurredAt(body?.occurredAt ?? parent.occurredAt);
    const description = body?.description
      ? String(body.description)
      : parent.description;
    const type = body?.type ? String(body.type) : "expense";

    await db
      .update(transactions)
      .set({ occurredAt, description, updatedAt: new Date() })
      .where(eq(transactions.id, eventId));

    // Void existing children so balances recompute from ledger.
    await db
      .update(transactions)
      .set({ status: "void", updatedAt: new Date() })
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.parentId, eventId),
        ),
      );

    if (type === "income") {
      const walletId = Number(body?.walletId);
      const amount = Number(body?.amount);

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

      await db.insert(transactions).values({
        userId: user.id,
        parentId: eventId,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        walletId,
        fundId: null,
        amount,
      });

      let allocatedTotal = 0;
      for (const pull of normalizedPulls) {
        const allocated = (amount * pull.percentage) / 100;
        allocatedTotal += allocated;

        await db.insert(transactions).values({
          userId: user.id,
          parentId: eventId,
          occurredAt,
          description: null,
          status: "posted",
          isPosting: true,
          walletId: null,
          fundId: pull.destFundId,
          amount: allocated,
        });
      }

      const savingsAllocated = amount - allocatedTotal;
      await db.insert(transactions).values({
        userId: user.id,
        parentId: eventId,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        walletId: null,
        fundId: savingsFundId,
        amount: savingsAllocated,
      });

      return NextResponse.json({ eventId });
    }

    const lines = Array.isArray(body?.lines) ? body.lines : null;
    if (!lines || lines.length === 0) {
      return NextResponse.json({ eventId });
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

      return { walletId, fundId, amount };
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

    const fundBalanceCache = new Map<number, number>();

    for (const line of parsedLines) {
      await db.insert(transactions).values({
        userId: user.id,
        parentId: eventId,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        walletId: line.walletId ?? null,
        fundId: line.fundId ?? null,
        amount: line.amount,
      });

      if (!line.fundId) {
        continue;
      }

      const fundKind = fundKindById.get(line.fundId);
      if (!fundKind || fundKind !== "regular") {
        continue;
      }

      const balanceBefore =
        fundBalanceCache.get(line.fundId) ??
        (await getFundBalanceAsOf({
          userId: user.id,
          fundId: line.fundId,
          occurredAt,
        }));

      const balanceAfter = balanceBefore + line.amount;

      if (balanceAfter < 0) {
        const deficit = -balanceAfter;

        await db.insert(transactions).values({
          userId: user.id,
          parentId: eventId,
          occurredAt,
          description: null,
          status: "posted",
          isPosting: true,
          walletId: null,
          fundId: line.fundId,
          amount: deficit,
        });

        await db.insert(transactions).values({
          userId: user.id,
          parentId: eventId,
          occurredAt,
          description: null,
          status: "posted",
          isPosting: true,
          walletId: null,
          fundId: savingsFundId,
          amount: -deficit,
        });

        fundBalanceCache.set(line.fundId, 0);
      } else {
        fundBalanceCache.set(line.fundId, balanceAfter);
      }
    }

    return NextResponse.json({ eventId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    if (
      message.startsWith("Invalid") ||
      message.includes("Line must") ||
      message.includes("Missing") ||
      message.includes("Fund not found")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("API: Error updating transaction", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
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

    const params = await ctx.params;
    const eventId = Number(params.id);
    if (!eventId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const parent = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, eventId),
          eq(transactions.userId, user.id),
          eq(transactions.isPosting, false),
          isNull(transactions.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!parent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    await db
      .update(transactions)
      .set({ status: "void", updatedAt: new Date() })
      .where(
        and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
      );

    await db
      .update(transactions)
      .set({ status: "void", updatedAt: new Date() })
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.parentId, eventId),
        ),
      );

    return NextResponse.json({ eventId });
  } catch (error) {
    console.error("API: Error deleting transaction", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
