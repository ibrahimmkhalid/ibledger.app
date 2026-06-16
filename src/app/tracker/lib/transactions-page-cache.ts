import { apiJson } from "@/app/tracker/lib/api";
import type { EventsResponse, TransactionsPageSize } from "@/app/tracker/types";

export const TRANSACTIONS_PRELOAD_RADIUS = 1;

export type TransactionPendingFilter = "all" | "pending" | "cleared";
export type TransactionIncomeFilter = "all" | "income" | "not_income";
export type TransactionDirectionFilter = "all" | "in" | "out";

export type TransactionsPageFilters = {
  search: string;
  fundIds: number[];
  walletIds: number[];
  minAmount: number | null;
  maxAmount: number | null;
  pendingStatus: TransactionPendingFilter;
  income: TransactionIncomeFilter;
  direction: TransactionDirectionFilter;
};

export const DEFAULT_TRANSACTIONS_FILTERS: TransactionsPageFilters = {
  search: "",
  fundIds: [],
  walletIds: [],
  minAmount: null,
  maxAmount: null,
  pendingStatus: "all",
  income: "all",
  direction: "all",
};

export type TransactionsPageQuery = {
  page: number;
  pageSize: TransactionsPageSize;
  filters: TransactionsPageFilters;
};

export function normalizeTransactionsFilters(
  filters: TransactionsPageFilters,
): TransactionsPageFilters {
  const normalizeIds = (ids: number[]) =>
    Array.from(
      new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ).sort((a, b) => a - b);

  return {
    search: filters.search.trim(),
    fundIds: normalizeIds(filters.fundIds),
    walletIds: normalizeIds(filters.walletIds),
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    pendingStatus: filters.pendingStatus,
    income: filters.income,
    direction: filters.direction,
  };
}

export function transactionsFiltersCacheKey(
  filters: TransactionsPageFilters,
): string {
  return JSON.stringify(normalizeTransactionsFilters(filters));
}

export function transactionsPageCacheKey(query: TransactionsPageQuery): string {
  return `${query.pageSize}:${query.page}:${transactionsFiltersCacheKey(
    query.filters,
  )}`;
}

export function buildTransactionsPageUrl(query: TransactionsPageQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  const filters = normalizeTransactionsFilters(query.filters);

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.fundIds.length > 0) {
    params.set("fundIds", filters.fundIds.join(","));
  }

  if (filters.walletIds.length > 0) {
    params.set("walletIds", filters.walletIds.join(","));
  }

  if (filters.minAmount !== null) {
    params.set("minAmount", String(filters.minAmount));
  }

  if (filters.maxAmount !== null) {
    params.set("maxAmount", String(filters.maxAmount));
  }

  if (filters.pendingStatus !== "all") {
    params.set("pendingStatus", filters.pendingStatus);
  }

  if (filters.income !== "all") {
    params.set("income", filters.income);
  }

  if (filters.direction !== "all") {
    params.set("direction", filters.direction);
  }

  return `/api/transactions?${params.toString()}`;
}

export async function fetchTransactionsPage(
  query: TransactionsPageQuery,
): Promise<EventsResponse> {
  return apiJson<EventsResponse>(buildTransactionsPageUrl(query));
}

export function getAdjacentPages(
  page: number,
  totalPages: number,
  radius = TRANSACTIONS_PRELOAD_RADIUS,
): number[] {
  if (totalPages <= 0) {
    return [];
  }

  const pages = new Set<number>();

  for (let offset = -radius; offset <= radius; offset += 1) {
    const target = page + offset;
    if (target >= 0 && target < totalPages) {
      pages.add(target);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

export type PageLinkItem = number | "ellipsis";

export function buildPageLinks(
  page: number,
  totalPages: number,
): PageLinkItem[] {
  if (totalPages <= 1) {
    return totalPages === 1 ? [0] : [];
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const pages = new Set<number>([0, totalPages - 1]);

  for (let offset = -2; offset <= 2; offset += 1) {
    const target = page + offset;
    if (target >= 0 && target < totalPages) {
      pages.add(target);
    }
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const links: PageLinkItem[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = sorted[index - 1];

    if (index > 0 && current - previous > 1) {
      links.push("ellipsis");
    }

    links.push(current);
  }

  return links;
}
