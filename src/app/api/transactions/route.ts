import { NextRequest, NextResponse } from "next/server";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import {
  BadRequestError,
  fuzzyLikePatterns,
  parseAmountParam,
  parseEnumParam,
  parseIdList,
  parseIntegerParam,
} from "@/app/api/query-params";
import {
  parseCreateTransactionLines,
  parseOccurredAt,
  parseRequestJsonObject,
} from "@/app/api/transactions/validation";
import { requireUser } from "@/lib/auth";
import {
  FUND_SHARE_SUM_ERROR,
  fundSharesExceedHundred,
} from "@/lib/fund-shares";

type PendingStatus = "all" | "pending" | "cleared";
type IncomeFilter = "all" | "income" | "not_income";
type DirectionFilter = "all" | "in" | "out";

function sqlNumberList(ids: number[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

function childExistsSql(userId: number, condition: SQL<unknown>) {
  return sql<boolean>`exists (
    select 1
    from "transactions" child
    where child."user_id" = ${userId}
      and child."parent_id" = ${transactions.id}
      and child."is_posting" = true
      and child."deleted_at" is null
      and ${condition}
  )`;
}

function eventDisplayAmountSql(userId: number) {
  return sql<number>`(
    case
      when ${transactions.isPosting} = true then ${transactions.amount}
      else coalesce(
        nullif((
          select coalesce(sum(child."amount"), 0)
          from "transactions" child
          where child."user_id" = ${userId}
            and child."parent_id" = ${transactions.id}
            and child."is_posting" = true
            and child."deleted_at" is null
            and child."wallet_id" is not null
        ), 0),
        (
          select coalesce(sum(child."amount"), 0)
          from "transactions" child
          where child."user_id" = ${userId}
            and child."parent_id" = ${transactions.id}
            and child."is_posting" = true
            and child."deleted_at" is null
            and child."fund_id" is not null
        ),
        0
      )
    end
  )`;
}

function incomeExistsSql(userId: number) {
  return childExistsSql(userId, sql`child."income_pull" is not null`);
}

// Unlike the posting-level search in /api/analytics, this matches at event
// granularity and reaches down into children.
function textSearchSql(userId: number, pattern: string) {
  const escapeChar = "\\";

  return sql<boolean>`(
    lower(coalesce(${transactions.description}, '')) like ${pattern} escape ${escapeChar}
    or exists (
      select 1
      from "wallets" direct_wallet
      where direct_wallet."id" = ${transactions.walletId}
        and direct_wallet."user_id" = ${userId}
        and direct_wallet."deleted_at" is null
        and lower(coalesce(direct_wallet."name", '')) like ${pattern} escape ${escapeChar}
    )
    or exists (
      select 1
      from "funds" direct_fund
      where direct_fund."id" = ${transactions.fundId}
        and direct_fund."user_id" = ${userId}
        and direct_fund."deleted_at" is null
        and lower(coalesce(direct_fund."name", '')) like ${pattern} escape ${escapeChar}
    )
    or exists (
      select 1
      from "transactions" child
      left join "wallets" child_wallet
        on child_wallet."id" = child."wallet_id"
       and child_wallet."user_id" = ${userId}
       and child_wallet."deleted_at" is null
      left join "funds" child_fund
        on child_fund."id" = child."fund_id"
       and child_fund."user_id" = ${userId}
       and child_fund."deleted_at" is null
      where child."user_id" = ${userId}
        and child."parent_id" = ${transactions.id}
        and child."is_posting" = true
        and child."deleted_at" is null
        and (
          lower(coalesce(child."description", '')) like ${pattern} escape ${escapeChar}
          or lower(coalesce(child_wallet."name", '')) like ${pattern} escape ${escapeChar}
          or lower(coalesce(child_fund."name", '')) like ${pattern} escape ${escapeChar}
        )
    )
  )`;
}

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

    const pendingStatus =
      searchParams.get("pendingOnly") === "true"
        ? "pending"
        : parseEnumParam<PendingStatus>(
            searchParams,
            "pendingStatus",
            ["all", "pending", "cleared"],
            "all",
          );
    const incomeFilter = parseEnumParam<IncomeFilter>(
      searchParams,
      "income",
      ["all", "income", "not_income"],
      "all",
    );
    const direction = parseEnumParam<DirectionFilter>(
      searchParams,
      "direction",
      ["all", "in", "out"],
      "all",
    );
    const fundIds = parseIdList(searchParams, "fundIds");
    const walletIds = parseIdList(searchParams, "walletIds");
    const minAmount = parseAmountParam(searchParams, "minAmount");
    const maxAmount = parseAmountParam(searchParams, "maxAmount");
    const search = searchParams.get("search")?.trim() ?? "";

    if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
      return NextResponse.json(
        { error: "minAmount cannot exceed maxAmount" },
        { status: 400 },
      );
    }

    const eventAmount = eventDisplayAmountSql(user.id);
    const incomeExists = incomeExistsSql(user.id);
    const filterConditions: SQL<unknown>[] = [
      eq(transactions.userId, user.id),
      isNull(transactions.parentId),
      isNull(transactions.deletedAt),
    ];

    if (pendingStatus === "pending") {
      filterConditions.push(eq(transactions.isPending, true));
    } else if (pendingStatus === "cleared") {
      filterConditions.push(eq(transactions.isPending, false));
    }

    if (fundIds.length > 0) {
      const ids = sqlNumberList(fundIds);
      const fundFilter = or(
        inArray(transactions.fundId, fundIds),
        childExistsSql(user.id, sql`child."fund_id" in (${ids})`),
      );
      if (fundFilter) {
        filterConditions.push(fundFilter);
      }
    }

    if (walletIds.length > 0) {
      const ids = sqlNumberList(walletIds);
      const walletFilter = or(
        inArray(transactions.walletId, walletIds),
        childExistsSql(user.id, sql`child."wallet_id" in (${ids})`),
      );
      if (walletFilter) {
        filterConditions.push(walletFilter);
      }
    }

    if (incomeFilter === "income") {
      filterConditions.push(incomeExists);
    } else if (incomeFilter === "not_income") {
      filterConditions.push(sql`not (${incomeExists})`);
    }

    if (direction === "in") {
      filterConditions.push(sql`${eventAmount} > 0`);
    } else if (direction === "out") {
      filterConditions.push(sql`${eventAmount} < 0`);
    }

    for (const pattern of fuzzyLikePatterns(search)) {
      filterConditions.push(textSearchSql(user.id, pattern));
    }

    if (minAmount !== null) {
      filterConditions.push(sql`abs(${eventAmount}) >= ${minAmount}`);
    }

    if (maxAmount !== null) {
      filterConditions.push(sql`abs(${eventAmount}) <= ${maxAmount}`);
    }

    const filters = and(...filterConditions);

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
          .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt))),
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

        // A full 100% split leaves nothing for savings. A zero-amount child
        // there fails isIncomeLike(), so the UI would open the expense modal
        // for an income event and the PATCH would 400 -- making the event
        // permanently uneditable. Omit the child instead.
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
