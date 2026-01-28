import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

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

async function getOverdraftDebtAsOf(args: {
  userId: number;
  fundId: number;
  occurredAt: Date;
}): Promise<number> {
  const { userId, fundId, occurredAt } = args;

  const row = await db
    .select({
      delta: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.as("delta"),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.fundId, fundId),
        eq(transactions.status, "posted"),
        eq(transactions.isPosting, true),
        isNull(transactions.deletedAt),
        lte(transactions.occurredAt, occurredAt),
        inArray(transactions.postingKind, [
          "overdraft_advance",
          "overdraft_repayment",
        ]),
      ),
    )
    .limit(1)
    .then((res) => res[0]);

  return Math.max(0, Number(row?.delta ?? 0));
}

async function ensureSystemFunds(args: { userId: number }) {
  const userFunds = await db
    .select({ id: funds.id, kind: funds.kind })
    .from(funds)
    .where(and(eq(funds.userId, args.userId), isNull(funds.deletedAt)));

  const fundKindByIdAll = new Map<number, string>(
    userFunds.map((f) => [f.id, String(f.kind)]),
  );

  const incomeFundId = userFunds.find((f) => f.kind === "income")?.id;
  const savingsFundId = userFunds.find((f) => f.kind === "savings")?.id;

  if (!incomeFundId || !savingsFundId) {
    throw new Error("Missing income/savings fund");
  }

  return { incomeFundId, savingsFundId, fundKindByIdAll };
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

    const { savingsFundId, fundKindByIdAll } = await ensureSystemFunds({
      userId: user.id,
    });

    const params = await ctx.params;
    const eventId = Number(params.id);
    if (!eventId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const event = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, eventId),
          eq(transactions.userId, user.id),
          isNull(transactions.parentId),
          isNull(transactions.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await request.json();

    const hasRebuildChanges =
      body?.type !== undefined ||
      body?.lines !== undefined ||
      body?.walletId !== undefined ||
      body?.amount !== undefined;

    const hasMetaChanges =
      body?.occurredAt !== undefined ||
      body?.description !== undefined ||
      body?.isPending !== undefined;

    // Metadata-only update: allow editing occurredAt/description/pending without
    // rebuilding ledger postings.
    if (!hasRebuildChanges && hasMetaChanges) {
      const occurredAt =
        body?.occurredAt === undefined
          ? event.occurredAt
          : parseOccurredAt(body.occurredAt);

      const description =
        body?.description === undefined
          ? event.description
          : body.description
            ? String(body.description)
            : null;

      const eventIsPending =
        body?.isPending === undefined
          ? Boolean(event.isPending)
          : Boolean(body.isPending);

      await db
        .update(transactions)
        .set({
          occurredAt,
          description,
          isPending: eventIsPending,
          updatedAt: new Date(),
        })
        .where(
          and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
        );

      await db
        .update(transactions)
        .set({ occurredAt, isPending: eventIsPending, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.userId, user.id),
            eq(transactions.parentId, eventId),
          ),
        );

      return NextResponse.json({ eventId });
    }

    const occurredAt = parseOccurredAt(body?.occurredAt ?? event.occurredAt);
    const description = body?.description
      ? String(body.description)
      : event.description;
    const type = body?.type ? String(body.type) : "expense";
    const eventIsPending =
      body?.isPending === undefined
        ? Boolean(event.isPending)
        : Boolean(body.isPending);

    const incomeSnapshot =
      type !== "income"
        ? null
        : await db
            .select({
              fundId: transactions.fundId,
              incomePull: transactions.incomePull,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, user.id),
                eq(transactions.parentId, eventId),
                eq(transactions.status, "posted"),
                eq(transactions.isPosting, true),
                isNull(transactions.deletedAt),
                isNotNull(transactions.incomePull),
              ),
            );

    // Rebuild: ensure the event row is a parent event, and recreate postings.
    await db
      .update(transactions)
      .set({
        occurredAt,
        description,
        isPending: eventIsPending,
        isPosting: false,
        walletId: null,
        fundId: null,
        amount: 0,
        updatedAt: new Date(),
      })
      .where(
        and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
      );

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

      const snapshot = incomeSnapshot;
      if (!snapshot || snapshot.length === 0) {
        return NextResponse.json(
          {
            error:
              "Income is missing pull snapshot (transactions.incomePull). Run your migration script first.",
          },
          { status: 400 },
        );
      }

      const savingsSnap = snapshot.find((s) => s.fundId === savingsFundId);
      if (!savingsSnap || savingsSnap.incomePull === null) {
        return NextResponse.json(
          {
            error:
              "Income snapshot is missing savings pull. Run your migration script first.",
          },
          { status: 400 },
        );
      }

      const normalizedPulls = snapshot
        .filter((s) => s.fundId && s.fundId !== savingsFundId)
        .map((s) => ({
          destFundId: s.fundId as number,
          percentage: Number(s.incomePull),
        }));

      const pullSum = normalizedPulls.reduce(
        (acc: number, p: { destFundId: number; percentage: number }) =>
          acc + p.percentage,
        0,
      );

      if (pullSum > 100) {
        return NextResponse.json(
          { error: "Invalid income snapshot: sum exceeds 100" },
          { status: 400 },
        );
      }

      let allocatedTotal = 0;
      const overdraftDebtCache = new Map<number, number>();
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
          isPending,
          incomePull: pull.percentage,
          walletId,
          fundId: pull.destFundId,
          amount: allocated,
        });

        const destFundKind = fundKindByIdAll.get(pull.destFundId);
        if (destFundKind === "regular" && allocated > 0) {
          const debtBefore =
            overdraftDebtCache.get(pull.destFundId) ??
            (await getOverdraftDebtAsOf({
              userId: user.id,
              fundId: pull.destFundId,
              occurredAt,
            }));

          const repay = Math.min(allocated, debtBefore);
          if (repay > 0) {
            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending,
              incomePull: null,
              walletId: null,
              fundId: pull.destFundId,
              amount: -repay,
              postingKind: "overdraft_repayment",
            });

            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending,
              incomePull: null,
              walletId: null,
              fundId: savingsFundId,
              amount: repay,
              postingKind: "overdraft_repayment",
            });

            overdraftDebtCache.set(pull.destFundId, debtBefore - repay);
          }
        }
      }

      const savingsAllocated = amount - allocatedTotal;
      await db.insert(transactions).values({
        userId: user.id,
        parentId: eventId,
        occurredAt,
        description: null,
        status: "posted",
        isPosting: true,
        isPending,
        incomePull: Number(savingsSnap.incomePull),
        walletId,
        fundId: savingsFundId,
        amount: savingsAllocated,
      });

      return NextResponse.json({ eventId });
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

    // If this is a single-line event, we can store it as a posting-only event
    // (no child rows) to reduce writes.
    if (parsedLines.length === 1) {
      const line = parsedLines[0];
      const fundId = line.fundId ?? null;

      if (fundId) {
        const fundKind = fundKindById.get(fundId);

        if (fundKind === "regular" && line.amount > 0) {
          const debtBefore = await getOverdraftDebtAsOf({
            userId: user.id,
            fundId,
            occurredAt,
          });

          const repay = Math.min(line.amount, debtBefore);
          if (repay > 0) {
            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: line.description ?? null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: line.walletId ?? null,
              fundId,
              amount: line.amount,
            });

            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId,
              amount: -repay,
              postingKind: "overdraft_repayment",
            });

            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId: savingsFundId,
              amount: repay,
              postingKind: "overdraft_repayment",
            });

            return NextResponse.json({ eventId });
          }
        }

        if (fundKind === "regular") {
          const balanceBefore = await getFundBalanceAsOf({
            userId: user.id,
            fundId,
            occurredAt,
          });

          const balanceAfter = balanceBefore + line.amount;

          if (balanceAfter < 0) {
            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: line.description ?? null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: line.walletId ?? null,
              fundId,
              amount: line.amount,
            });

            const deficit = -balanceAfter;

            // Internal fund transfers should not affect wallet balances.
            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId,
              amount: deficit,
              postingKind: "overdraft_advance",
            });

            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId: savingsFundId,
              amount: -deficit,
              postingKind: "overdraft_advance",
            });

            return NextResponse.json({ eventId });
          }
        }
      }

      await db
        .update(transactions)
        .set({
          isPosting: true,
          isPending: line.isPending,
          walletId: line.walletId ?? null,
          fundId,
          amount: line.amount,
          updatedAt: new Date(),
        })
        .where(
          and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
        );

      return NextResponse.json({ eventId });
    }

    const fundBalanceCache = new Map<number, number>();
    const overdraftDebtCache = new Map<number, number>();

    for (const line of parsedLines) {
      if (line.fundId) {
        const fundKind = fundKindById.get(line.fundId);

        if (fundKind === "regular") {
          if (line.amount > 0) {
            const debtBefore =
              overdraftDebtCache.get(line.fundId) ??
              (await getOverdraftDebtAsOf({
                userId: user.id,
                fundId: line.fundId,
                occurredAt,
              }));

            const repay = Math.min(line.amount, debtBefore);
            if (repay > 0) {
              await db.insert(transactions).values({
                userId: user.id,
                parentId: eventId,
                occurredAt,
                description: null,
                status: "posted",
                isPosting: true,
                isPending: line.isPending,
                walletId: null,
                fundId: line.fundId,
                amount: -repay,
                postingKind: "overdraft_repayment",
              });

              await db.insert(transactions).values({
                userId: user.id,
                parentId: eventId,
                occurredAt,
                description: null,
                status: "posted",
                isPosting: true,
                isPending: line.isPending,
                walletId: null,
                fundId: savingsFundId,
                amount: repay,
                postingKind: "overdraft_repayment",
              });

              overdraftDebtCache.set(line.fundId, debtBefore - repay);
            }
          }

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
            parentId: eventId,
            occurredAt,
            description: line.description ?? null,
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
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId: line.fundId,
              amount: deficit,
              postingKind: "overdraft_advance",
            });

            await db.insert(transactions).values({
              userId: user.id,
              parentId: eventId,
              occurredAt,
              description: null,
              status: "posted",
              isPosting: true,
              isPending: line.isPending,
              walletId: null,
              fundId: savingsFundId,
              amount: -deficit,
              postingKind: "overdraft_advance",
            });

            fundBalanceCache.set(line.fundId, 0);
          } else {
            fundBalanceCache.set(line.fundId, balanceAfter);
          }

          continue;
        }
      }

      await db.insert(transactions).values({
        userId: user.id,
        parentId: eventId,
        occurredAt,
        description: line.description ?? null,
        status: "posted",
        isPosting: true,
        isPending: line.isPending,
        walletId: line.walletId ?? null,
        fundId: line.fundId ?? null,
        amount: line.amount,
      });
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
          isNull(transactions.parentId),
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
