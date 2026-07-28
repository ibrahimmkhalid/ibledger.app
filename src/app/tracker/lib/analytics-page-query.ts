// The analytics page deliberately drops the transactions page's pending-status,
// income, and direction filters: the summary cards and charts already break
// spending out from income, pending from cleared, and inflow from outflow, so
// filtering on any of them empties half the page instead of narrowing it. What
// is left are the filters that scope *which* transactions the breakdown covers.
export type AnalyticsPageFilters = {
  search: string;
  fundIds: number[];
  walletIds: number[];
  minAmount: number | null;
  maxAmount: number | null;
};

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsPageFilters = {
  search: "",
  fundIds: [],
  walletIds: [],
  minAmount: null,
  maxAmount: null,
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
  };
}

export function analyticsFiltersCacheKey(
  filters: AnalyticsPageFilters,
): string {
  return JSON.stringify(normalizeAnalyticsFilters(filters));
}

// Serializes the five transaction-level filters the analytics endpoint accepts,
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
}
