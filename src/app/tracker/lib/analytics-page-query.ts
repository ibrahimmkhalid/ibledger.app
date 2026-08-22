// Analytics exposes fewer filters than the transactions page. Status, income,
// and direction split axes the charts already break out, and an amount cut-off
// would make totals like Net and Spending stop meaning what they say.
export type AnalyticsPageFilters = {
  search: string;
  fundIds: number[];
  walletIds: number[];
};

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsPageFilters = {
  search: "",
  fundIds: [],
  walletIds: [],
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
  };
}

export function analyticsFiltersCacheKey(
  filters: AnalyticsPageFilters,
): string {
  return JSON.stringify(normalizeAnalyticsFilters(filters));
}

// Serializes the three filters the analytics endpoint accepts, normalized
// first so a request matches the analyticsFiltersCacheKey it is cached under.
// The caller adds the date-range and grouping params separately.
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
}
