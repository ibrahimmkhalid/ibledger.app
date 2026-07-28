export type AnalyticsDirectionFilter = "all" | "in" | "out";

// The analytics page deliberately drops the transactions page's pending-status
// and income filters: the summary cards and charts already break spending out
// from income and pending from cleared, so filtering on either one empties half
// the page instead of narrowing it.
export type AnalyticsPageFilters = {
  search: string;
  fundIds: number[];
  walletIds: number[];
  minAmount: number | null;
  maxAmount: number | null;
  direction: AnalyticsDirectionFilter;
};

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsPageFilters = {
  search: "",
  fundIds: [],
  walletIds: [],
  minAmount: null,
  maxAmount: null,
  direction: "all",
};

export function normalizeAnalyticsFilters(
  filters: AnalyticsPageFilters,
): AnalyticsPageFilters {
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
    direction: filters.direction,
  };
}

export function analyticsFiltersCacheKey(
  filters: AnalyticsPageFilters,
): string {
  return JSON.stringify(normalizeAnalyticsFilters(filters));
}

// Serializes the six transaction-level filters the analytics endpoint accepts,
// matching what @/app/api/query-params reads back. The caller adds the
// date-range and grouping params separately. Normalizes first so a request
// always matches the analyticsFiltersCacheKey it is cached under, whatever the
// caller passes in.
export function appendAnalyticsFilterParams(
  params: URLSearchParams,
  filters: AnalyticsPageFilters,
) {
  const normalized = normalizeAnalyticsFilters(filters);

  if (normalized.search) params.set("search", normalized.search);
  if (normalized.fundIds.length > 0)
    params.set("fundIds", normalized.fundIds.join(","));
  if (normalized.walletIds.length > 0)
    params.set("walletIds", normalized.walletIds.join(","));
  if (normalized.minAmount !== null)
    params.set("minAmount", String(normalized.minAmount));
  if (normalized.maxAmount !== null)
    params.set("maxAmount", String(normalized.maxAmount));
  if (normalized.direction !== "all")
    params.set("direction", normalized.direction);
}
