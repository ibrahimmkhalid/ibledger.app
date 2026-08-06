import { NextRequest, NextResponse } from "next/server";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import {
  BadRequestError,
  fuzzyLikePatterns,
  parseAmountParam,
  parseDateParam,
  parseEnumParam,
  parseIdList,
} from "@/app/api/query-params";
import { requireUser } from "@/lib/auth";
import { FUND_DISPLAY_ORDER } from "@/lib/fund-order";

type PendingStatus = "all" | "pending" | "cleared";
type IncomeFilter = "all" | "income" | "not_income";
type DirectionFilter = "all" | "in" | "out";
type GroupBy = "day" | "week" | "month";

type PostingRow = {
  id: number;
  occurredAt: Date;
  description: string | null;
  isPending: boolean;
  amount: number;
  incomePull: number | null;
  walletId: number | null;
  walletName: string | null;
  fundId: number | null;
  fundName: string | null;
};

type StartingBalanceRow = {
  amount: number;
  walletId: number | null;
  fundId: number | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// Unlike the events search in /api/transactions, this matches at posting
// granularity and reaches up to the parent for its description.
function textSearchSql(userId: number, pattern: string) {
  const escapeChar = "\\";

  return sql<boolean>`(
    lower(coalesce(${transactions.description}, '')) like ${pattern} escape ${escapeChar}
    or lower(coalesce(${wallets.name}, '')) like ${pattern} escape ${escapeChar}
    or lower(coalesce(${funds.name}, '')) like ${pattern} escape ${escapeChar}
    or exists (
      select 1
      from "transactions" parent
      where parent."id" = ${transactions.parentId}
        and parent."user_id" = ${userId}
        and parent."deleted_at" is null
        and lower(coalesce(parent."description", '')) like ${pattern} escape ${escapeChar}
    )
  )`;
}

function entityKey(id: number | null, name: string | null, fallback: string) {
  return {
    key: id === null ? "unassigned" : String(id),
    id,
    name: name ?? fallback,
  };
}

function emptyMoney() {
  return {
    income: 0,
    spending: 0,
    net: 0,
    cleared: 0,
    withPending: 0,
    pending: 0,
    count: 0,
  };
}

function applyAmount(total: ReturnType<typeof emptyMoney>, row: PostingRow) {
  const amount = Number(row.amount);
  if (!Number.isFinite(amount)) return;

  total.count += 1;
  total.withPending += amount;
  if (row.isPending) {
    total.pending += amount;
  } else {
    total.cleared += amount;
  }

  if (amount >= 0) {
    total.income += amount;
  } else {
    total.spending += Math.abs(amount);
  }
  total.net += amount;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = next.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + mondayOffset);
  return next;
}

function periodKey(date: Date, groupBy: GroupBy) {
  if (groupBy === "day") return isoDate(date);
  if (groupBy === "week") return isoDate(startOfWeek(date));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function periodLabel(key: string, groupBy: GroupBy) {
  if (groupBy === "month") {
    const [year, month] = key.split("-").map((part) => Number(part));
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  if (groupBy === "week") {
    return `Week of ${key}`;
  }

  return key;
}

function toPercent(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
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
    const groupBy = parseEnumParam<GroupBy>(
      searchParams,
      "groupBy",
      ["day", "week", "month"],
      "month",
    );
    const fundIds = parseIdList(searchParams, "fundIds");
    const walletIds = parseIdList(searchParams, "walletIds");
    const minAmount = parseAmountParam(searchParams, "minAmount");
    const maxAmount = parseAmountParam(searchParams, "maxAmount");
    const startDate = parseDateParam(searchParams, "startDate");
    const endDate = parseDateParam(searchParams, "endDate");
    const search = searchParams.get("search")?.trim() ?? "";

    if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
      return NextResponse.json(
        { error: "minAmount cannot exceed maxAmount" },
        { status: 400 },
      );
    }

    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { error: "startDate cannot be after endDate" },
        { status: 400 },
      );
    }

    const { user, response } = await requireUser();
    if (!user) return response;

    const baseConditions: SQL<unknown>[] = [
      eq(transactions.userId, user.id),
      eq(transactions.isPosting, true),
      isNull(transactions.deletedAt),
    ];

    if (pendingStatus === "pending") {
      baseConditions.push(eq(transactions.isPending, true));
    } else if (pendingStatus === "cleared") {
      baseConditions.push(eq(transactions.isPending, false));
    }

    if (fundIds.length > 0) {
      baseConditions.push(inArray(transactions.fundId, fundIds));
    }

    if (walletIds.length > 0) {
      baseConditions.push(inArray(transactions.walletId, walletIds));
    }

    if (incomeFilter === "income") {
      baseConditions.push(sql`${transactions.incomePull} is not null`);
    } else if (incomeFilter === "not_income") {
      baseConditions.push(sql`${transactions.incomePull} is null`);
    }

    if (direction === "in") {
      baseConditions.push(sql`${transactions.amount} > 0`);
    } else if (direction === "out") {
      baseConditions.push(sql`${transactions.amount} < 0`);
    }

    if (minAmount !== null) {
      baseConditions.push(sql`abs(${transactions.amount}) >= ${minAmount}`);
    }

    if (maxAmount !== null) {
      baseConditions.push(sql`abs(${transactions.amount}) <= ${maxAmount}`);
    }

    for (const pattern of fuzzyLikePatterns(search)) {
      baseConditions.push(textSearchSql(user.id, pattern));
    }

    const rangedConditions = [...baseConditions];

    if (startDate) {
      rangedConditions.push(gte(transactions.occurredAt, startDate));
    }

    if (endDate) {
      rangedConditions.push(lt(transactions.occurredAt, addDays(endDate, 1)));
    }

    const startingRowsPromise: Promise<StartingBalanceRow[]> = startDate
      ? db
          .select({
            amount: transactions.amount,
            walletId: transactions.walletId,
            fundId: transactions.fundId,
          })
          .from(transactions)
          .leftJoin(wallets, eq(wallets.id, transactions.walletId))
          .leftJoin(funds, eq(funds.id, transactions.fundId))
          .where(and(...baseConditions, lt(transactions.occurredAt, startDate)))
      : Promise.resolve([]);

    const [walletRows, fundRows, postingRows, startingRows] = await Promise.all(
      [
        db
          .select({ id: wallets.id, name: wallets.name })
          .from(wallets)
          .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
          .orderBy(asc(wallets.name)),
        db
          .select({
            id: funds.id,
            name: funds.name,
            isSavings: funds.isSavings,
            pullPercentage: funds.pullPercentage,
          })
          .from(funds)
          .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)))
          .orderBy(...FUND_DISPLAY_ORDER),
        db
          .select({
            id: transactions.id,
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
          .where(and(...rangedConditions))
          .orderBy(asc(transactions.occurredAt), asc(transactions.id)),
        startingRowsPromise,
      ],
    );

    const walletTotals = new Map<string, ReturnType<typeof emptyMoney>>();
    const fundTotals = new Map<string, ReturnType<typeof emptyMoney>>();
    const periodTotals = new Map<string, ReturnType<typeof emptyMoney>>();
    const walletPeriodTotals = new Map<
      string,
      Map<string, ReturnType<typeof emptyMoney>>
    >();
    const fundPeriodTotals = new Map<
      string,
      Map<string, ReturnType<typeof emptyMoney>>
    >();
    const summary = emptyMoney();
    const periods = new Set<string>();
    const walletStartingBalances = new Map<string, number>();
    const fundStartingBalances = new Map<string, number>();

    for (const row of startingRows) {
      const amount = Number(row.amount);
      if (!Number.isFinite(amount)) continue;

      if (row.walletId !== null) {
        const key = String(row.walletId);
        walletStartingBalances.set(
          key,
          (walletStartingBalances.get(key) ?? 0) + amount,
        );
      }

      if (row.fundId !== null) {
        const key = String(row.fundId);
        fundStartingBalances.set(
          key,
          (fundStartingBalances.get(key) ?? 0) + amount,
        );
      }
    }

    for (const row of postingRows) {
      const wallet = entityKey(
        row.walletId,
        row.walletName,
        "Unassigned wallet",
      );
      const fund = entityKey(row.fundId, row.fundName, "Unassigned fund");
      const period = periodKey(new Date(row.occurredAt), groupBy);
      periods.add(period);

      const walletTotal = walletTotals.get(wallet.key) ?? emptyMoney();
      const fundTotal = fundTotals.get(fund.key) ?? emptyMoney();
      const periodTotal = periodTotals.get(period) ?? emptyMoney();
      const walletPeriod =
        walletPeriodTotals.get(wallet.key) ??
        new Map<string, ReturnType<typeof emptyMoney>>();
      const fundPeriod =
        fundPeriodTotals.get(fund.key) ??
        new Map<string, ReturnType<typeof emptyMoney>>();
      const walletPeriodTotal = walletPeriod.get(period) ?? emptyMoney();
      const fundPeriodTotal = fundPeriod.get(period) ?? emptyMoney();

      applyAmount(summary, row);
      applyAmount(walletTotal, row);
      applyAmount(fundTotal, row);
      applyAmount(periodTotal, row);
      applyAmount(walletPeriodTotal, row);
      applyAmount(fundPeriodTotal, row);

      walletTotals.set(wallet.key, walletTotal);
      fundTotals.set(fund.key, fundTotal);
      periodTotals.set(period, periodTotal);
      walletPeriod.set(period, walletPeriodTotal);
      fundPeriod.set(period, fundPeriodTotal);
      walletPeriodTotals.set(wallet.key, walletPeriod);
      fundPeriodTotals.set(fund.key, fundPeriod);
    }

    const sortedPeriods = Array.from(periods).sort();
    const walletTotalsList = walletRows.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      ...(walletTotals.get(String(wallet.id)) ?? emptyMoney()),
    }));
    const fundTotalsList = fundRows.map((fund) => ({
      id: fund.id,
      name: fund.name,
      isSavings: fund.isSavings,
      pullPercentage: fund.pullPercentage,
      ...(fundTotals.get(String(fund.id)) ?? emptyMoney()),
    }));

    const timeSeries = sortedPeriods.map((period) => ({
      period,
      label: periodLabel(period, groupBy),
      ...(periodTotals.get(period) ?? emptyMoney()),
    }));

    function buildSeries(
      sourceRows: Array<{ id: number; name: string }>,
      sourceTotals: Map<string, ReturnType<typeof emptyMoney>>,
      periodSource: Map<string, Map<string, ReturnType<typeof emptyMoney>>>,
      startingSource: Map<string, number>,
    ) {
      return sourceRows
        .map((row) => {
          const key = String(row.id);
          const totals = sourceTotals.get(key) ?? emptyMoney();
          const periodMap = periodSource.get(key) ?? new Map();
          const startingValue = startingSource.get(key) ?? 0;
          let cumulative = 0;
          return {
            id: row.id,
            name: row.name,
            total: totals.net,
            spending: totals.spending,
            income: totals.income,
            points: sortedPeriods.map((period) => {
              const total = periodMap.get(period) ?? emptyMoney();
              cumulative += total.net;
              return {
                period,
                label: periodLabel(period, groupBy),
                value: total.net,
                cumulative,
                raw: startingValue + cumulative,
              };
            }),
          };
        })
        .filter((series) =>
          series.points.some((point) => point.value !== 0 || point.raw !== 0),
        )
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    }

    const byFundSpending = fundTotalsList
      .filter((fund) => fund.spending > 0)
      .map((fund) => ({
        id: fund.id,
        name: fund.name,
        spending: fund.spending,
        income: fund.income,
        net: fund.net,
        share: toPercent(fund.spending, summary.spending),
      }))
      .sort((a, b) => b.spending - a.spending);

    const byWalletSpending = walletTotalsList
      .filter((wallet) => wallet.spending > 0)
      .map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        spending: wallet.spending,
        income: wallet.income,
        net: wallet.net,
        share: toPercent(wallet.spending, summary.spending),
      }))
      .sort((a, b) => b.spending - a.spending);

    return NextResponse.json({
      groupBy,
      range: {
        startDate: startDate ? isoDate(startDate) : null,
        endDate: endDate ? isoDate(endDate) : null,
        firstTransactionAt: postingRows[0]?.occurredAt ?? null,
        lastTransactionAt: postingRows.at(-1)?.occurredAt ?? null,
      },
      summary,
      timeSeries,
      walletSeries: buildSeries(
        walletRows,
        walletTotals,
        walletPeriodTotals,
        walletStartingBalances,
      ),
      fundSeries: buildSeries(
        fundRows,
        fundTotals,
        fundPeriodTotals,
        fundStartingBalances,
      ),
      categorizedSpending: byFundSpending,
      walletSpending: byWalletSpending,
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("API: Error fetching analytics", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
