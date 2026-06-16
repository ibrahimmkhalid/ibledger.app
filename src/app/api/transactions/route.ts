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
  parseCreateTransactionLines,
  parseOccurredAt,
  parseRequestJsonObject,
  type CreateTransactionLineInput,
} from "@/app/api/transactions/validation";
import { currentUser, currentUserWithDB } from "@/lib/auth";

type PendingStatus = "all" | "pending" | "cleared";
type IncomeFilter = "all" | "income" | "not_income";
type DirectionFilter = "all" | "in" | "out";

function parseIntegerParam(
  searchParams: URLSearchParams,
  name: string,
  fallback: number,
) {
  const raw = searchParams.get(name);
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

function parseEnumParam<T extends string>(
  searchParams: URLSearchParams,
  name: string,
  allowed: readonly T[],
  fallback: T,
) {
  const raw = searchParams.get(name);
  if (!raw) {
    return fallback;
  }

  if (!allowed.includes(raw as T)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return raw as T;
}

function parseAmountParam(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

function parseIdList(searchParams: URLSearchParams, pluralName: string) {
  const singularName = pluralName.replace(/s$/, "");
  const rawValues = [
    ...searchParams.getAll(pluralName),
    ...searchParams.getAll(singularName),
  ];

  if (rawValues.length === 0) {
    return [];
  }

  const ids = rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value));

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new BadRequestError(`Invalid ${pluralName}`);
  }

  return Array.from(new Set(ids));
}

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

function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, "\\$&");
}

function fuzzyLikePatterns(search: string) {
  return search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((term) => `%${Array.from(term).map(escapeLike).join("%")}%`);
}

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
    const nonAmountFilterConditions: SQL<unknown>[] = [
      eq(transactions.userId, user.id),
      isNull(transactions.parentId),
      isNull(transactions.deletedAt),
    ];

    if (pendingStatus === "pending") {
      nonAmountFilterConditions.push(eq(transactions.isPending, true));
    } else if (pendingStatus === "cleared") {
      nonAmountFilterConditions.push(eq(transactions.isPending, false));
    }

    if (fundIds.length > 0) {
      const ids = sqlNumberList(fundIds);
      const fundFilter = or(
        inArray(transactions.fundId, fundIds),
        childExistsSql(user.id, sql`child."fund_id" in (${ids})`),
      );
      if (fundFilter) {
        nonAmountFilterConditions.push(fundFilter);
      }
    }

    if (walletIds.length > 0) {
      const ids = sqlNumberList(walletIds);
      const walletFilter = or(
        inArray(transactions.walletId, walletIds),
        childExistsSql(user.id, sql`child."wallet_id" in (${ids})`),
      );
      if (walletFilter) {
        nonAmountFilterConditions.push(walletFilter);
      }
    }

    if (incomeFilter === "income") {
      nonAmountFilterConditions.push(incomeExists);
    } else if (incomeFilter === "not_income") {
      nonAmountFilterConditions.push(sql`not (${incomeExists})`);
    }

    if (direction === "in") {
      nonAmountFilterConditions.push(sql`${eventAmount} > 0`);
    } else if (direction === "out") {
      nonAmountFilterConditions.push(sql`${eventAmount} < 0`);
    }

    for (const pattern of fuzzyLikePatterns(search)) {
      nonAmountFilterConditions.push(textSearchSql(user.id, pattern));
    }

    const amountFilterConditions: SQL<unknown>[] = [];

    if (minAmount !== null) {
      amountFilterConditions.push(sql`abs(${eventAmount}) >= ${minAmount}`);
    }

    if (maxAmount !== null) {
      amountFilterConditions.push(sql`abs(${eventAmount}) <= ${maxAmount}`);
    }

    const filters = and(
      ...nonAmountFilterConditions,
      ...amountFilterConditions,
    );

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

    const body = await parseRequestJsonObject(request);

    const occurredAt = parseOccurredAt(body.occurredAt);
    const description = body.description ? String(body.description) : null;
    const eventIsPending =
      body.isPending === undefined ? true : Boolean(body.isPending);

    const type = body.type ? String(body.type) : "expense";

    if (type === "income") {
      const walletId = Number(body.walletId);
      const amount = Number(body.amount);
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

    const lines = parseCreateTransactionLines(body.lines, eventIsPending);
    if (!lines || lines.length === 0) {
      return NextResponse.json({ error: "Missing lines" }, { status: 400 });
    }

    const parsedLines: CreateTransactionLineInput[] = lines;

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
