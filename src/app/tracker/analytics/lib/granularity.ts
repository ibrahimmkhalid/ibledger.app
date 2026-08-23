import type {
  AnalyticsFilterDraft,
  DateRangePreset,
  GranularityLevel,
  GroupBy,
} from "@/app/tracker/analytics/types";

export const DEFAULT_DATE_PRESET: DateRangePreset = "last_6_months";
export const DEFAULT_GRANULARITY_LEVEL: GranularityLevel = "fine";

export const GRANULARITY_LEVELS: ReadonlyArray<GranularityLevel> = [
  "fine",
  "medium",
  "coarse",
];

// The Detail control shows the bucket a slot resolves to for the current
// range, not an abstract Fine/Medium/Coarse.
export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

// Shown on a slot with no bucket to offer.
export const GRANULARITY_EMPTY_LABEL = "N/A";

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
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Shift a date back by whole months, clamping to the target month's final day
// so setMonth can't overflow (May 31 minus a month is Apr 30, not May 1).
function monthsAgoClamped(base: Date, months: number): Date {
  const target = new Date(base);
  target.setDate(1);
  target.setMonth(target.getMonth() - months);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return target;
}

// Resolves a relative range preset into concrete start/end dates (inclusive of
// today). "all" clears the range so analytics span every transaction.
export function dateRangeForPreset(preset: DateRangePreset): {
  startDate: string;
  endDate: string;
} {
  if (preset === "all") return { startDate: "", endDate: "" };

  const today = new Date();
  let start = new Date(today);

  switch (preset) {
    case "last_week":
      // Back 6 days: the range is inclusive of today, giving seven dates.
      start.setDate(start.getDate() - 6);
      break;
    case "last_month":
      start = monthsAgoClamped(today, 1);
      break;
    case "last_3_months":
      start = monthsAgoClamped(today, 3);
      break;
    case "last_6_months":
      start = monthsAgoClamped(today, 6);
      break;
    case "last_year":
      start = monthsAgoClamped(today, 12);
      break;
    case "ytd":
      start.setMonth(0, 1);
      break;
    default: {
      const unhandled: never = preset;
      throw new Error(`Unhandled date preset: ${String(unhandled)}`);
    }
  }

  return { startDate: toISODate(start), endDate: toISODate(today) };
}

function daysInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / 86_400_000) + 1);
}

function parseLocalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function effectiveSpanDays(args: {
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

function estimatedBars(groupBy: GroupBy, spanDays: number) {
  if (groupBy === "day") return spanDays;
  if (groupBy === "week") return Math.ceil(spanDays / 7);
  return Math.max(1, Math.ceil(spanDays / 30));
}

function dynamicGranularitySlots(spanDays: number) {
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

type GranularitySlotState = {
  groupBy: GroupBy | null;
  disabled: boolean;
  /** Why this slot is unavailable, for the user. null when it is available. */
  reason: string | null;
};

function slotReason(groupBy: GroupBy | null, spanDays: number): string | null {
  // Any of the three slots can come up empty, so this cannot say where the
  // missing one sits relative to the others.
  if (groupBy === null) {
    return "This date range has no other bucket size to offer.";
  }

  const bars = estimatedBars(groupBy, spanDays);
  const label = GROUP_BY_LABELS[groupBy].toLowerCase();

  if (bars < 2) {
    return `Too little data to chart ${label} over this date range.`;
  }
  if (bars > 120) {
    return `${GROUP_BY_LABELS[groupBy]} would draw too many points to read over this date range.`;
  }
  return null;
}

function resolveGranularitySlots(
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
      const reason = slotReason(groupBy, spanDays);
      acc[level] = { groupBy, disabled: reason !== null, reason };
      return acc;
    },
    {} as Record<GranularityLevel, GranularitySlotState>,
  );
}

function pickGranularityLevel(
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
