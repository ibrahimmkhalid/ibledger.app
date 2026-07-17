import {
  countActiveTransactionFilters,
  parseFilterAmount,
} from "@/app/tracker/components/filter-controls";
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  normalizeTransactionsFilters,
  transactionsFiltersCacheKey,
} from "@/app/tracker/lib/transactions-page-cache";
import {
  DEFAULT_DATE_PRESET,
  DEFAULT_GRANULARITY_LEVEL,
  GRANULARITY_SLOT_MAP,
  dateRangeForPreset,
} from "@/app/tracker/analytics/lib/granularity";
import type {
  AnalyticsFilterDraft,
  AnalyticsFilters,
} from "@/app/tracker/analytics/types";

export function createDefaultAnalyticsFilters(): AnalyticsFilters {
  const { startDate, endDate } = dateRangeForPreset(DEFAULT_DATE_PRESET);
  return {
    ...DEFAULT_TRANSACTIONS_FILTERS,
    startDate,
    endDate,
    groupBy:
      GRANULARITY_SLOT_MAP[DEFAULT_DATE_PRESET][DEFAULT_GRANULARITY_LEVEL] ??
      "week",
  };
}

export function createDefaultFilterDraft(): AnalyticsFilterDraft {
  const { startDate, endDate } = dateRangeForPreset(DEFAULT_DATE_PRESET);
  return {
    ...DEFAULT_TRANSACTIONS_FILTERS,
    startDate,
    endDate,
    groupBy:
      GRANULARITY_SLOT_MAP[DEFAULT_DATE_PRESET][DEFAULT_GRANULARITY_LEVEL] ??
      "week",
    minAmount: "",
    maxAmount: "",
    datePreset: DEFAULT_DATE_PRESET,
    granularityLevel: DEFAULT_GRANULARITY_LEVEL,
  };
}
export function draftToFilters(draft: AnalyticsFilterDraft): AnalyticsFilters {
  const minAmount = parseFilterAmount(draft.minAmount, "Minimum");
  const maxAmount = parseFilterAmount(draft.maxAmount, "Maximum");

  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    throw new Error("Minimum amount cannot exceed maximum amount");
  }

  if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
    throw new Error("Start date cannot be after end date");
  }

  return {
    ...normalizeTransactionsFilters({
      ...draft,
      minAmount,
      maxAmount,
    }),
    startDate: draft.startDate,
    endDate: draft.endDate,
    groupBy: draft.groupBy,
  };
}

export function analyticsFiltersKey(filters: AnalyticsFilters) {
  return JSON.stringify({
    transactions: transactionsFiltersCacheKey(filters),
    startDate: filters.startDate,
    endDate: filters.endDate,
    groupBy: filters.groupBy,
  });
}

export function isDefaultAnalyticsFilters(filters: AnalyticsFilters) {
  try {
    return (
      analyticsFiltersKey(filters) ===
      analyticsFiltersKey(createDefaultAnalyticsFilters())
    );
  } catch {
    return false;
  }
}

export function countActiveFilters(filters: AnalyticsFilters) {
  const defaults = createDefaultAnalyticsFilters();
  let count = countActiveTransactionFilters(filters);
  if (
    (filters.startDate || filters.endDate) &&
    (filters.startDate !== defaults.startDate ||
      filters.endDate !== defaults.endDate)
  ) {
    count += 1;
  }
  return count;
}

export function buildAnalyticsUrl(filters: AnalyticsFilters) {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.fundIds.length > 0)
    params.set("fundIds", filters.fundIds.join(","));
  if (filters.walletIds.length > 0) {
    params.set("walletIds", filters.walletIds.join(","));
  }
  if (filters.minAmount !== null)
    params.set("minAmount", String(filters.minAmount));
  if (filters.maxAmount !== null)
    params.set("maxAmount", String(filters.maxAmount));
  if (filters.pendingStatus !== "all") {
    params.set("pendingStatus", filters.pendingStatus);
  }
  if (filters.income !== "all") params.set("income", filters.income);
  if (filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.groupBy !== "month") params.set("groupBy", filters.groupBy);

  const query = params.toString();
  return `/api/analytics${query ? `?${query}` : ""}`;
}
