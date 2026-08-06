import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { transactions } from "@/db/schema";
import {
  BadRequestError,
  fuzzyLikePatterns,
  parseAmountParam,
  parseDateParam,
  parseEnumParam,
  parseIdList,
} from "@/app/api/query-params";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export type PendingStatus = "all" | "pending" | "cleared";
export type IncomeFilter = "all" | "income" | "not_income";
export type DirectionFilter = "all" | "in" | "out";

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

export function eventDisplayAmountSql(userId: number) {
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

/**
 * Builds the event-level WHERE conditions for the eight transaction filters the
 * transactions list understands.
 *
 * Shared with POST /api/transactions/clear-pending so "Clear pending" settles
 * exactly the rows the user is looking at — it used to take no parameters and
 * silently clear the whole ledger while sitting beside a filtered count.
 *
 * Throws BadRequestError for a min/max range that can never match.
 */
export function buildEventFilterConditions(
  searchParams: URLSearchParams,
  userId: number,
): SQL<unknown>[] {
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
  const startDate = parseDateParam(searchParams, "startDate");
  const endDate = parseDateParam(searchParams, "endDate");

  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    throw new BadRequestError("minAmount cannot exceed maxAmount");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new BadRequestError("startDate cannot be after endDate");
  }

  const eventAmount = eventDisplayAmountSql(userId);
  const incomeExists = incomeExistsSql(userId);

  const conditions: SQL<unknown>[] = [
    eq(transactions.userId, userId),
    isNull(transactions.parentId),
    isNull(transactions.deletedAt),
  ];

  if (pendingStatus === "pending") {
    conditions.push(eq(transactions.isPending, true));
  } else if (pendingStatus === "cleared") {
    conditions.push(eq(transactions.isPending, false));
  }

  if (fundIds.length > 0) {
    const ids = sqlNumberList(fundIds);
    const fundFilter = or(
      inArray(transactions.fundId, fundIds),
      childExistsSql(userId, sql`child."fund_id" in (${ids})`),
    );
    if (fundFilter) conditions.push(fundFilter);
  }

  if (walletIds.length > 0) {
    const ids = sqlNumberList(walletIds);
    const walletFilter = or(
      inArray(transactions.walletId, walletIds),
      childExistsSql(userId, sql`child."wallet_id" in (${ids})`),
    );
    if (walletFilter) conditions.push(walletFilter);
  }

  if (incomeFilter === "income") {
    conditions.push(incomeExists);
  } else if (incomeFilter === "not_income") {
    conditions.push(sql`not (${incomeExists})`);
  }

  if (direction === "in") {
    conditions.push(sql`${eventAmount} > 0`);
  } else if (direction === "out") {
    conditions.push(sql`${eventAmount} < 0`);
  }

  for (const pattern of fuzzyLikePatterns(search)) {
    conditions.push(textSearchSql(userId, pattern));
  }

  if (minAmount !== null) {
    conditions.push(sql`abs(${eventAmount}) >= ${minAmount}`);
  }

  if (maxAmount !== null) {
    conditions.push(sql`abs(${eventAmount}) <= ${maxAmount}`);
  }

  if (startDate) {
    conditions.push(gte(transactions.occurredAt, startDate));
  }

  // Both bounds are inclusive dates, so the end compares against the start of
  // the following day rather than midnight on the day itself.
  if (endDate) {
    conditions.push(lt(transactions.occurredAt, addDays(endDate, 1)));
  }

  return conditions;
}

export function buildEventFilters(
  searchParams: URLSearchParams,
  userId: number,
) {
  return and(...buildEventFilterConditions(searchParams, userId));
}
