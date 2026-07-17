import type {
  AnalyticsFilterDraft,
  DateRangePreset,
  GranularityLevel,
  GroupBy,
} from "@/app/tracker/analytics/types";

export const DEFAULT_DATE_PRESET: DateRangePreset = "last_6_months";
export const DEFAULT_GRANULARITY_LEVEL: GranularityLevel = "fine";

export const GRANULARITY_LEVELS: ReadonlyArray<{
  value: GranularityLevel;
  label: string;
}> = [
  { value: "fine", label: "Fine" },
  { value: "medium", label: "Medium" },
  { value: "coarse", label: "Coarse" },
];

// Base (range, zoom) → bucket size before data-span capping.
export const GRANULARITY_SLOT_MAP: Record<
  DateRangePreset,
  Record<GranularityLevel, GroupBy | null>
> = {
  all: { fine: "day", medium: "week", coarse: "month" },
  last_week: { fine: "day", medium: null, coarse: null },
  last_month: { fine: "day", medium: null, coarse: "week" },
  last_3_months: { fine: "day", medium: "week", coarse: "month" },
  last_6_months: { fine: "week", medium: null, coarse: "month" },
  last_year: { fine: "week", medium: "month", coarse: null },
  ytd: { fine: "day", medium: "week", coarse: "month" },
};

export const DATE_RANGE_PRESETS: ReadonlyArray<{
  value: DateRangePreset;
  label: string;
}> = [
  { value: "all", label: "All time" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "last_year", label: "Last year" },
  { value: "ytd", label: "Year to date" },
];
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Resolves a relative range preset into concrete start/end dates (inclusive of
// today). "all" clears the range so analytics span every transaction.
export function dateRangeForPreset(preset: DateRangePreset): {
  startDate: string;
  endDate: string;
} {
  if (preset === "all") return { startDate: "", endDate: "" };

  const today = new Date();
  const start = new Date(today);

  switch (preset) {
    case "last_week":
      start.setDate(start.getDate() - 7);
      break;
    case "last_month":
      start.setMonth(start.getMonth() - 1);
      break;
    case "last_3_months":
      start.setMonth(start.getMonth() - 3);
      break;
    case "last_6_months":
      start.setMonth(start.getMonth() - 6);
      break;
    case "last_year":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "ytd":
      start.setMonth(0, 1);
      break;
  }

  return { startDate: toISODate(start), endDate: toISODate(today) };
}

export function daysInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / 86_400_000) + 1);
}

export function parseLocalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function effectiveSpanDays(args: {
  preset: DateRangePreset;
  startDate: string;
  endDate: string;
  firstTransactionAt: string | null;
  lastTransactionAt: string | null;
}) {
  const presetRange = dateRangeForPreset(args.preset);
  const today = new Date();

  let start = args.startDate
    ? parseLocalDate(args.startDate)
    : presetRange.startDate
      ? parseLocalDate(presetRange.startDate)
      : args.firstTransactionAt
        ? new Date(args.firstTransactionAt)
        : null;
  let end = args.endDate
    ? parseLocalDate(args.endDate)
    : presetRange.endDate
      ? parseLocalDate(presetRange.endDate)
      : today;

  if (args.firstTransactionAt) {
    const first = new Date(args.firstTransactionAt);
    if (!start || first > start) start = first;
  }
  if (args.lastTransactionAt) {
    const last = new Date(args.lastTransactionAt);
    if (last < end) end = last;
  }

  if (!start) return 365;

  return daysInclusive(start, end);
}

export function estimatedBars(groupBy: GroupBy, spanDays: number) {
  if (groupBy === "day") return spanDays;
  if (groupBy === "week") return Math.ceil(spanDays / 7);
  return Math.max(1, Math.ceil(spanDays / 30));
}

export function isGranularityValid(groupBy: GroupBy, spanDays: number) {
  const bars = estimatedBars(groupBy, spanDays);
  return bars >= 2 && bars <= 120;
}

export function dynamicGranularitySlots(spanDays: number) {
  if (spanDays <= 14) {
    return { fine: "day" as const, medium: null, coarse: null };
  }
  if (spanDays <= 45) {
    return { fine: "day" as const, medium: null, coarse: "week" as const };
  }
  if (spanDays <= 120) {
    return {
      fine: "day" as const,
      medium: "week" as const,
      coarse: "month" as const,
    };
  }
  if (spanDays <= 210) {
    return {
      fine: "week" as const,
      medium: null,
      coarse: "month" as const,
    };
  }
  return {
    fine: "week" as const,
    medium: "month" as const,
    coarse: null,
  };
}

export type GranularitySlotState = {
  groupBy: GroupBy | null;
  disabled: boolean;
};

export function resolveGranularitySlots(
  preset: DateRangePreset,
  spanDays: number,
): Record<GranularityLevel, GranularitySlotState> {
  const raw =
    preset === "all" || preset === "ytd"
      ? dynamicGranularitySlots(spanDays)
      : GRANULARITY_SLOT_MAP[preset];

  const slots: Record<GranularityLevel, GroupBy | null> = { ...raw };

  if (slots.medium === slots.fine) slots.medium = null;
  if (slots.coarse === slots.medium || slots.coarse === slots.fine) {
    slots.coarse = null;
  }

  return (["fine", "medium", "coarse"] as const).reduce(
    (acc, level) => {
      const groupBy = slots[level];
      const disabled =
        groupBy === null || !isGranularityValid(groupBy, spanDays);
      acc[level] = { groupBy, disabled };
      return acc;
    },
    {} as Record<GranularityLevel, GranularitySlotState>,
  );
}

export function pickGranularityLevel(
  slots: Record<GranularityLevel, GranularitySlotState>,
  preferred: GranularityLevel = "medium",
): GranularityLevel {
  if (!slots[preferred].disabled && slots[preferred].groupBy !== null) {
    return preferred;
  }

  for (const level of ["medium", "fine", "coarse"] as const) {
    if (!slots[level].disabled && slots[level].groupBy !== null) {
      return level;
    }
  }

  return "fine";
}

export function groupByForGranularity(
  preset: DateRangePreset,
  startDate: string,
  endDate: string,
  granularityLevel: GranularityLevel,
  firstTransactionAt: string | null,
  lastTransactionAt: string | null,
) {
  const spanDays = effectiveSpanDays({
    preset,
    startDate,
    endDate,
    firstTransactionAt,
    lastTransactionAt,
  });
  const slots = resolveGranularitySlots(preset, spanDays);
  const level = pickGranularityLevel(slots, granularityLevel);
  return {
    granularityLevel: level,
    groupBy: slots[level].groupBy ?? "month",
    slots,
    spanDays,
  };
}

export function syncGranularityDraft(
  draft: AnalyticsFilterDraft,
  firstTransactionAt: string | null,
  lastTransactionAt: string | null,
  options?: { preferLevel?: GranularityLevel },
): AnalyticsFilterDraft {
  const resolved = groupByForGranularity(
    draft.datePreset,
    draft.startDate,
    draft.endDate,
    options?.preferLevel ?? draft.granularityLevel,
    firstTransactionAt,
    lastTransactionAt,
  );

  return {
    ...draft,
    granularityLevel: resolved.granularityLevel,
    groupBy: resolved.groupBy,
  };
}
