import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import { parseRequestJsonObject } from "@/app/api/json-body";
import { BadRequestError, parseIntegerParam } from "@/app/api/query-params";
import {
  parseCreateTransactionLines,
  parseOccurredAt,
} from "@/app/api/transactions/validation";
import { buildEventFilters } from "@/app/api/transactions/event-filters";
import { requireUser } from "@/lib/auth";
import { FUND_DISPLAY_ORDER } from "@/lib/fund-order";
import {
  FUND_SHARE_SUM_ERROR,
  fundSharesExceedHundred,
} from "@/lib/fund-shares";

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const page = parseIntegerParam(searchParams, "page", 0);

    if (page < 0) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

    const { user, response } = await requireUser();
    if (!user) return response;

    const allowedPageSizes = [20, 50, 100];
    const pageSize = parseIntegerParam(searchParams, "pageSize", 20);

    if (!allowedPageSizes.includes(pageSize)) {
      return NextResponse.json({ error: "Invalid pageSize" }, { status: 400 });
    }

    const filters = buildEventFilters(searchParams, user.id);

    const [countRows, events] = await Promise.all([
      db.select({ value: count() }).from(transactions).where(filters),
      db
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
        .where(filters)
        .orderBy(desc(transactions.occurredAt), desc(transactions.id))
        .offset(page * pageSize)
        .limit(pageSize),
    ]);
    const countRow = countRows[0];

    const totalCount = Number(countRow?.value ?? 0);
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);

    if (totalPages > 0 && page >= totalPages) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

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
            .orderBy(asc(transactions.id));

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

    const eventsWithChildren = events.map((event) => ({
      ...event,
      children: childrenByParentId.get(event.id) ?? [],
    }));

    return NextResponse.json({
      events: eventsWithChildren,
      currentPage: page,
      nextPage: page + 1 < totalPages ? page + 1 : -1,
      prevPage: page > 0 ? page - 1 : -1,
      totalCount,
      totalPages,
      pageSize,
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("API: Error fetching transactions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const body = await parseRequestJsonObject(request);

    const occurredAt = parseOccurredAt(body.occurredAt);
    const description = body.description ? String(body.description) : null;
    const eventIsPending =
      body.isPending === undefined ? true : Boolean(body.isPending);

    const type = body.type ? String(body.type) : "expense";

    if (type === "income") {
      const walletId = Number(body.walletId);
      const amount = Number(body.amount);

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

      const [userFunds, ownedWallet] = await Promise.all([
        db
          .select({
            id: funds.id,
            isSavings: funds.isSavings,
            pullPercentage: funds.pullPercentage,
          })
          .from(funds)
          .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)))
          .orderBy(...FUND_DISPLAY_ORDER),
        db
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
          .then((res) => res[0]),
      ]);

      if (!ownedWallet) {
        return NextResponse.json(
          { error: "Wallet not found" },
          { status: 404 },
        );
      }

      const savingsFundId = userFunds.find((f) => Boolean(f.isSavings))?.id;

      if (!savingsFundId) {
        return NextResponse.json(
          {
            error: "Missing savings fund. Call POST /api/bootstrap first.",
          },
          { status: 400 },
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

      if (fundSharesExceedHundred(pullSum)) {
        return NextResponse.json(
          { error: FUND_SHARE_SUM_ERROR },
          { status: 400 },
        );
      }

      const eventId = await db.transaction(async (tx) => {
        const parent = await tx
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
          throw new Error("Failed to create event");
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
            isPending: eventIsPending,
            incomePull: pull.percentage,
            walletId,
            fundId: pull.destFundId,
            amount: allocated,
          });
        }

        // A full 100% split leaves savings nothing. A zero-amount child fails
        // isIncomeLike() and makes the event uneditable, so omit it.
        if (pullSum < 100) {
          postingRows.push({
            userId: user.id,
            parentId: parent.id,
            occurredAt,
            description: null,
            isPosting: true,
            isPending: eventIsPending,
            incomePull: 100 - pullSum,
            walletId,
            fundId: savingsFundId,
            amount: amount - allocatedTotal,
          });
        }

        await tx.insert(transactions).values(postingRows);

        return parent.id;
      });

      return NextResponse.json({ eventId });
    }

    const lines = parseCreateTransactionLines(body.lines, eventIsPending);
    if (!lines || lines.length === 0) {
      return NextResponse.json({ error: "Missing lines" }, { status: 400 });
    }

    const neededWalletIds = Array.from(
      new Set(lines.map((l) => l.walletId).filter((id): id is number => !!id)),
    );
    const neededFundIds = Array.from(
      new Set(lines.map((l) => l.fundId).filter((id): id is number => !!id)),
    );

    const [ownedWallets, fundRows] = await Promise.all([
      neededWalletIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: wallets.id })
            .from(wallets)
            .where(
              and(
                eq(wallets.userId, user.id),
                inArray(wallets.id, neededWalletIds),
                isNull(wallets.deletedAt),
              ),
            ),
      neededFundIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: funds.id })
            .from(funds)
            .where(
              and(
                eq(funds.userId, user.id),
                inArray(funds.id, neededFundIds),
                isNull(funds.deletedAt),
              ),
            ),
    ]);

    if (neededWalletIds.length > 0) {
      if (ownedWallets.length !== neededWalletIds.length) {
        return NextResponse.json(
          { error: "One or more wallets not found" },
          { status: 400 },
        );
      }
    }

    if (fundRows.length !== neededFundIds.length) {
      return NextResponse.json(
        { error: "One or more funds not found" },
        { status: 400 },
      );
    }

    // If this is a single-line event, store it as a posting-only event
    // (no child rows) to reduce inserts.
    if (lines.length === 1) {
      const line = lines[0];
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

    const eventId = await db.transaction(async (tx) => {
      const parent = await tx
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
        throw new Error("Failed to create event");
      }

      await tx.insert(transactions).values(
        lines.map((line) => ({
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

      return parent.id;
    });

    return NextResponse.json({ eventId });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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
