import { countActiveSharedFilters } from "@/app/tracker/components/filter-controls";
import {
  DEFAULT_ANALYTICS_FILTERS,
  analyticsFiltersCacheKey,
  appendAnalyticsFilterParams,
  normalizeAnalyticsFilters,
} from "@/app/tracker/lib/analytics-page-query";
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
    ...DEFAULT_ANALYTICS_FILTERS,
    startDate,
    endDate,
    groupBy:
      GRANULARITY_SLOT_MAP[DEFAULT_DATE_PRESET][DEFAULT_GRANULARITY_LEVEL] ??
      "week",
  };
}

export function createDefaultFilterDraft(): AnalyticsFilterDraft {
  return {
    ...createDefaultAnalyticsFilters(),
    datePreset: DEFAULT_DATE_PRESET,
    granularityLevel: DEFAULT_GRANULARITY_LEVEL,
  };
}

export function draftToFilters(draft: AnalyticsFilterDraft): AnalyticsFilters {
  if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
    throw new Error("Start date cannot be after end date");
  }

  return {
    ...normalizeAnalyticsFilters(draft),
    startDate: draft.startDate,
    endDate: draft.endDate,
    groupBy: draft.groupBy,
  };
}

export function analyticsFiltersKey(filters: AnalyticsFilters) {
  return JSON.stringify({
    filters: analyticsFiltersCacheKey(filters),
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
  let count = countActiveSharedFilters(filters);
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

  appendAnalyticsFilterParams(params, filters);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.groupBy !== "month") params.set("groupBy", filters.groupBy);

  const query = params.toString();
  return `/api/analytics${query ? `?${query}` : ""}`;
}
