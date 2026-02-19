import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

type TransactionLineInput = {
  transactionId: number | null;
  walletId: number | null;
  fundId: number | null;
  description: string | null;
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

function isIncomeLikeEvent(args: {
  eventIsPosting: boolean;
  childIncomePulls: Array<number | null>;
}) {
  if (args.eventIsPosting) return false;
  return args.childIncomePulls.some((p) => p !== null);
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

    const childPostings = await db
      .select({
        id: transactions.id,
        occurredAt: transactions.occurredAt,
        description: transactions.description,
        isPending: transactions.isPending,
        amount: transactions.amount,
        incomePull: transactions.incomePull,
        walletId: transactions.walletId,
        fundId: transactions.fundId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.parentId, eventId),
          eq(transactions.isPosting, true),
          isNull(transactions.deletedAt),
        ),
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await request.json();

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

    const type = body?.type ? String(body.type) : null;

    const incomeLike = isIncomeLikeEvent({
      eventIsPosting: Boolean(event.isPosting),
      childIncomePulls: childPostings.map((p) => p.incomePull ?? null),
    });

    if (type === "income" || incomeLike) {
      const nextWalletIdRaw = body?.walletId;
      const nextAmountRaw = body?.amount;

      const nextWalletId =
        nextWalletIdRaw === null || nextWalletIdRaw === undefined
          ? null
          : Number(nextWalletIdRaw);
      const nextTotal =
        nextAmountRaw === null || nextAmountRaw === undefined
          ? null
          : Number(nextAmountRaw);

      if (!nextWalletId || Number.isNaN(nextWalletId)) {
        return NextResponse.json(
          { error: "Missing walletId" },
          { status: 400 },
        );
      }
      if (!nextTotal || Number.isNaN(nextTotal) || nextTotal <= 0) {
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
            eq(wallets.id, nextWalletId),
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

      const savingsFundId = await db
        .select({ id: funds.id })
        .from(funds)
        .where(
          and(
            eq(funds.userId, user.id),
            eq(funds.isSavings, true),
            isNull(funds.deletedAt),
          ),
        )
        .limit(1)
        .then((res) => res[0]?.id ?? null);

      if (!savingsFundId) {
        return NextResponse.json(
          {
            error: "Missing savings fund. Call POST /api/bootstrap first.",
          },
          { status: 400 },
        );
      }

      await db.transaction(async (tx) => {
        await tx
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

        await tx
          .update(transactions)
          .set({ occurredAt, isPending: eventIsPending, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.userId, user.id),
              eq(transactions.parentId, eventId),
              isNull(transactions.deletedAt),
            ),
          );

        const allocationPostings = childPostings
          .filter((p) => p.incomePull !== null)
          .sort((a, b) => a.id - b.id);

        if (allocationPostings.length === 0) {
          return;
        }

        const savingsPosting = allocationPostings.find(
          (p) => p.fundId === savingsFundId,
        );

        if (!savingsPosting) {
          throw new Error(
            "Missing savings allocation posting for this income event",
          );
        }

        const nonSavingsPostings = allocationPostings.filter(
          (p) => p.id !== savingsPosting.id,
        );

        let nonSavingsAllocated = 0;
        for (const p of nonSavingsPostings) {
          const pct = Number(p.incomePull ?? 0);
          const nextAmount = (nextTotal * pct) / 100;
          nonSavingsAllocated += nextAmount;

          await tx
            .update(transactions)
            .set({
              walletId: nextWalletId,
              amount: nextAmount,
              updatedAt: new Date(),
            })
            .where(
              and(eq(transactions.userId, user.id), eq(transactions.id, p.id)),
            );
        }

        const savingsAmount = nextTotal - nonSavingsAllocated;

        await tx
          .update(transactions)
          .set({
            walletId: nextWalletId,
            amount: savingsAmount,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(transactions.userId, user.id),
              eq(transactions.id, savingsPosting.id),
            ),
          );
      });

      return NextResponse.json({ eventId });
    }

    const linesRaw = Array.isArray(body?.lines) ? body.lines : null;
    const parsedLines: TransactionLineInput[] | null = linesRaw
      ? linesRaw.map((l: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const line: any = l;
          const amount = Number(line.amount);
          const transactionIdRaw = line.transactionId;
          const transactionId =
            transactionIdRaw === null || transactionIdRaw === undefined
              ? null
              : Number(transactionIdRaw);

          const walletId =
            line.walletId === null || line.walletId === undefined
              ? null
              : Number(line.walletId);
          const fundId =
            line.fundId === null || line.fundId === undefined
              ? null
              : Number(line.fundId);

          const isPending =
            line.isPending === undefined
              ? eventIsPending
              : Boolean(line.isPending);

          const lineDesc =
            line.description === undefined || line.description === null
              ? null
              : String(line.description);

          if (Number.isNaN(amount) || amount === 0) {
            throw new Error("Invalid amount");
          }
          if (transactionId !== null && Number.isNaN(transactionId)) {
            throw new Error("Invalid transactionId");
          }
          if (walletId !== null && Number.isNaN(walletId)) {
            throw new Error("Invalid walletId");
          }
          if (fundId !== null && Number.isNaN(fundId)) {
            throw new Error("Invalid fundId");
          }
          if (walletId === null || fundId === null) {
            throw new Error("Line must include walletId and fundId");
          }

          return {
            transactionId,
            walletId,
            fundId,
            description: lineDesc,
            amount,
            isPending,
          };
        })
      : null;

    // Metadata-only update.
    if (!parsedLines) {
      await db.transaction(async (tx) => {
        await tx
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

        if (!event.isPosting) {
          await tx
            .update(transactions)
            .set({
              occurredAt,
              isPending: eventIsPending,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(transactions.userId, user.id),
                eq(transactions.parentId, eventId),
                isNull(transactions.deletedAt),
              ),
            );
        }
      });

      return NextResponse.json({ eventId });
    }

    if (parsedLines.length === 0) {
      return NextResponse.json({ error: "Missing lines" }, { status: 400 });
    }

    const existingShape = event.isPosting ? "posting_only" : "parent_children";
    const existingChildIds = childPostings.map((p) => p.id);
    const existingChildIdSet = new Set(existingChildIds);

    const desiredShape =
      parsedLines.length === 1 ? "posting_only" : "parent_children";

    const seenIds = new Set<number>();
    for (const line of parsedLines) {
      if (line.transactionId === null) continue;
      if (seenIds.has(line.transactionId)) {
        return NextResponse.json(
          { error: "Duplicate transactionId in lines" },
          { status: 400 },
        );
      }
      seenIds.add(line.transactionId);
    }

    if (existingShape === "posting_only") {
      for (const line of parsedLines) {
        if (line.transactionId !== null && line.transactionId !== eventId) {
          return NextResponse.json(
            { error: "Invalid transactionId for this event" },
            { status: 400 },
          );
        }
      }
    }

    if (existingShape === "parent_children") {
      for (const line of parsedLines) {
        if (line.transactionId === eventId) {
          return NextResponse.json(
            { error: "transactionId cannot reference the parent event" },
            { status: 400 },
          );
        }
        if (
          line.transactionId !== null &&
          !existingChildIdSet.has(line.transactionId)
        ) {
          return NextResponse.json(
            { error: "Invalid transactionId for this event" },
            { status: 400 },
          );
        }
      }
    }

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

    if (neededFundIds.length > 0) {
      const ownedFunds = await db
        .select({ id: funds.id })
        .from(funds)
        .where(
          and(
            eq(funds.userId, user.id),
            inArray(funds.id, neededFundIds),
            isNull(funds.deletedAt),
          ),
        );

      if (ownedFunds.length !== neededFundIds.length) {
        return NextResponse.json(
          { error: "One or more funds not found" },
          { status: 400 },
        );
      }
    }

    await db.transaction(async (tx) => {
      if (desiredShape === "posting_only") {
        const line = parsedLines[0];

        if (
          existingShape === "parent_children" &&
          existingChildIds.length > 0
        ) {
          await tx
            .update(transactions)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(transactions.userId, user.id),
                inArray(transactions.id, existingChildIds),
              ),
            );
        }

        await tx
          .update(transactions)
          .set({
            occurredAt,
            description,
            isPosting: true,
            isPending: line.isPending,
            incomePull: null,
            walletId: line.walletId,
            fundId: line.fundId,
            amount: line.amount,
            updatedAt: new Date(),
          })
          .where(
            and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
          );

        return;
      }

      // parent_children
      await tx
        .update(transactions)
        .set({
          occurredAt,
          description,
          isPosting: false,
          isPending: eventIsPending,
          incomePull: null,
          walletId: null,
          fundId: null,
          amount: 0,
          updatedAt: new Date(),
        })
        .where(
          and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
        );

      if (existingShape === "posting_only") {
        // Convert posting-only parent into parent+children by inserting new postings.
        for (const line of parsedLines) {
          await tx.insert(transactions).values({
            userId: user.id,
            parentId: eventId,
            occurredAt,
            description: line.description,
            isPosting: true,
            isPending: line.isPending,
            incomePull: null,
            walletId: line.walletId,
            fundId: line.fundId,
            amount: line.amount,
          });
        }
        return;
      }

      const updateIds = new Set<number>();
      for (const line of parsedLines) {
        if (line.transactionId === null) continue;
        updateIds.add(line.transactionId);
        await tx
          .update(transactions)
          .set({
            occurredAt,
            description: line.description,
            isPosting: true,
            isPending: line.isPending,
            incomePull: null,
            walletId: line.walletId,
            fundId: line.fundId,
            amount: line.amount,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(transactions.userId, user.id),
              eq(transactions.id, line.transactionId),
            ),
          );
      }

      for (const line of parsedLines) {
        if (line.transactionId !== null) continue;
        await tx.insert(transactions).values({
          userId: user.id,
          parentId: eventId,
          occurredAt,
          description: line.description,
          isPosting: true,
          isPending: line.isPending,
          incomePull: null,
          walletId: line.walletId,
          fundId: line.fundId,
          amount: line.amount,
        });
      }

      const toSoftDelete = existingChildIds.filter((id) => !updateIds.has(id));
      if (toSoftDelete.length > 0) {
        await tx
          .update(transactions)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(transactions.userId, user.id),
              inArray(transactions.id, toSoftDelete),
            ),
          );
      }
    });

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
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(transactions.userId, user.id), eq(transactions.id, eventId)),
      );

    await db
      .update(transactions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
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
