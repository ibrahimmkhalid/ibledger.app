// Analytics exposes far fewer filters than the transactions page. Pending
// status, income, and direction each split an axis the summary cards and charts
// already break out, so filtering on them empties half the page instead of
// narrowing it. The amount range is dropped for a different reason: totals like
// Net and Spending stop meaning what their labels say once an amount cut-off
// silently excludes transactions. What is left picks *which* transactions the
// breakdown covers, by description or by account.
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

// Serializes the three transaction-level filters the analytics endpoint
// accepts, matching what @/app/api/query-params reads back. The caller adds the
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
}
