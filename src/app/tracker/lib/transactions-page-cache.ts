import { apiJson } from "@/app/tracker/lib/api";
import type { EventsResponse, TransactionsPageSize } from "@/app/tracker/types";

export const TRANSACTIONS_PRELOAD_RADIUS = 2;

export type TransactionsPageQuery = {
  page: number;
  pendingOnly: boolean;
  pageSize: TransactionsPageSize;
};

export function transactionsPageCacheKey(query: TransactionsPageQuery): string {
  return `${query.pendingOnly}:${query.pageSize}:${query.page}`;
}

export function buildTransactionsPageUrl(query: TransactionsPageQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.pendingOnly) {
    params.set("pendingOnly", "true");
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
