"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import dynamic from "next/dynamic";
import {
  BarChart3Icon,
  CheckIcon,
  ChevronDownIcon,
  ListFilterIcon,
  Maximize2Icon,
  RefreshCwIcon,
  SearchIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { AnalyticsSkeleton } from "@/app/tracker/analytics/analytics-skeleton";
import { apiJson } from "@/app/tracker/lib/api";
import { fmtAmount } from "@/app/tracker/lib/format";
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  normalizeTransactionsFilters,
  transactionsFiltersCacheKey,
  type TransactionDirectionFilter,
  type TransactionIncomeFilter,
  type TransactionPendingFilter,
  type TransactionsPageFilters,
} from "@/app/tracker/lib/transactions-page-cache";
import type { BootstrapResponse, Fund, Wallet } from "@/app/tracker/types";
import type { PlotMarker } from "plotly.js";
import type { PlotParams } from "react-plotly.js";

type PlotData = NonNullable<PlotParams["data"]>[number];

const Plot = dynamic<PlotParams>(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="border-border bg-muted/20 text-muted-foreground flex h-72 items-center justify-center rounded-md border text-xs">
      Loading chart.
    </div>
  ),
});

type GroupBy = "day" | "week" | "month";

type GranularityLevel = "fine" | "medium" | "coarse";

type DateRangePreset =
  | "all"
  | "last_week"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "last_year"
  | "ytd";

type AnalyticsFilters = TransactionsPageFilters & {
  startDate: string;
  endDate: string;
  groupBy: GroupBy;
};

type AnalyticsFilterDraft = Omit<
  AnalyticsFilters,
  "minAmount" | "maxAmount"
> & {
  minAmount: string;
  maxAmount: string;
  datePreset: DateRangePreset;
  granularityLevel: GranularityLevel;
};

type MoneyTotal = {
  income: number;
  spending: number;
  net: number;
  cleared: number;
  withPending: number;
  pending: number;
  count: number;
};

type AnalyticsResponse = {
  groupBy: GroupBy;
  range: {
    startDate: string | null;
    endDate: string | null;
    firstTransactionAt: string | null;
    lastTransactionAt: string | null;
  };
  summary: MoneyTotal;
  wallets: Array<
    MoneyTotal & {
      id: number;
      name: string;
    }
  >;
  funds: Array<
    MoneyTotal & {
      id: number;
      name: string;
      isSavings: boolean;
      pullPercentage: number;
    }
  >;
  timeSeries: Array<
    MoneyTotal & {
      period: string;
      label: string;
    }
  >;
  walletSeries: TrendSeries[];
  fundSeries: TrendSeries[];
  categorizedSpending: SpendingRow[];
  walletSpending: SpendingRow[];
};

type TrendSeries = {
  id: number;
  name: string;
  total: number;
  spending: number;
  income: number;
  points: Array<{
    period: string;
    label: string;
    value: number;
    cumulative: number;
  }>;
};

type SpendingRow = {
  id: number;
  name: string;
  spending: number;
  income: number;
  net: number;
  share: number;
};

type MultiSelectOption = {
  id: number;
  name: string;
};

const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = {
  ...DEFAULT_TRANSACTIONS_FILTERS,
  startDate: "",
  endDate: "",
  groupBy: "month",
};

const DEFAULT_FILTER_DRAFT: AnalyticsFilterDraft = {
  ...DEFAULT_ANALYTICS_FILTERS,
  minAmount: "",
  maxAmount: "",
  datePreset: "all",
  granularityLevel: "medium",
};

const GRANULARITY_LEVELS: ReadonlyArray<{
  value: GranularityLevel;
  label: string;
}> = [
  { value: "fine", label: "Fine" },
  { value: "medium", label: "Medium" },
  { value: "coarse", label: "Coarse" },
];

// Base (range, zoom) → bucket size before data-span capping.
const GRANULARITY_SLOT_MAP: Record<
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

const DATE_RANGE_PRESETS: ReadonlyArray<{
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

// Resolves a relative range preset into concrete start/end dates (inclusive of
// today). "all" clears the range so analytics span every transaction.
function dateRangeForPreset(preset: DateRangePreset): {
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

function isGranularityValid(groupBy: GroupBy, spanDays: number) {
  const bars = estimatedBars(groupBy, spanDays);
  return bars >= 2 && bars <= 120;
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
};

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
      const disabled =
        groupBy === null || !isGranularityValid(groupBy, spanDays);
      acc[level] = { groupBy, disabled };
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

function groupByForGranularity(
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

function syncGranularityDraft(
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

const CHART_COLORS = [
  "#06b6d4",
  "#e05260",
  "#7c3aed",
  "#f59e0b",
  "#10b981",
  "#64748b",
];

const CASHFLOW_SYMLOG_SCALE = 100;

// Diverging colors for the net cashflow bars: emerald for net gain, rose for
// net loss. Kept in sync with the income/spending tones used elsewhere.
const CASHFLOW_POSITIVE = "#059669";
const CASHFLOW_NEGATIVE = "#e05260";

const ROLLING_AVERAGE_WINDOWS: Record<GroupBy, number> = {
  day: 10,
  week: 5,
  month: 3,
};

function rollingAverageValues(values: number[], windowSize: number) {
  let sum = 0;

  return values.map((value, index) => {
    sum += value;
    if (index >= windowSize) sum -= values[index - windowSize];

    return index >= windowSize - 1 ? sum / windowSize : null;
  });
}

function parseFilterAmount(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} amount must be zero or greater`);
  }

  return parsed;
}

function draftToFilters(draft: AnalyticsFilterDraft): AnalyticsFilters {
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

function analyticsFiltersKey(filters: AnalyticsFilters) {
  return JSON.stringify({
    transactions: transactionsFiltersCacheKey(filters),
    startDate: filters.startDate,
    endDate: filters.endDate,
    groupBy: filters.groupBy,
  });
}

function countActiveFilters(filters: AnalyticsFilters) {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.fundIds.length > 0) count += 1;
  if (filters.walletIds.length > 0) count += 1;
  if (filters.minAmount !== null || filters.maxAmount !== null) count += 1;
  if (filters.pendingStatus !== "all") count += 1;
  if (filters.income !== "all") count += 1;
  if (filters.direction !== "all") count += 1;
  if (filters.startDate || filters.endDate) count += 1;
  return count;
}

function buildAnalyticsUrl(filters: AnalyticsFilters) {
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

function toggleSelectedId(ids: number[], id: number) {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

function MultiSelectDropdown(args: {
  label: string;
  allLabel: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const { label, allLabel, options, selectedIds, onChange } = args;
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      option.name.toLowerCase().includes(query),
    );
  }, [options, search]);

  const summary = useMemo(() => {
    if (selectedIds.length === 0) return allLabel;
    if (selectedIds.length === 1) {
      return (
        options.find((option) => option.id === selectedIds[0])?.name ??
        "1 selected"
      );
    }
    return `${selectedIds.length} selected`;
  }, [allLabel, options, selectedIds]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>{label}</Label>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between px-2 font-normal"
          >
            <span className="min-w-0 truncate">{summary}</span>
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="bg-popover text-popover-foreground ring-foreground/10 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg p-2 shadow-md ring-1"
          >
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                id={searchId}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                className="pl-7"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onChange([])}
                disabled={selectedIds.length === 0}
              >
                Clear
              </Button>
              <div className="text-muted-foreground text-xs">
                {selectedIds.length === 0
                  ? allLabel
                  : `${selectedIds.length} selected`}
              </div>
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto pr-1">
              {filteredOptions.length === 0 ? (
                <div className="text-muted-foreground px-2 py-4 text-center text-xs">
                  No matches.
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = selectedSet.has(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() =>
                        onChange(toggleSelectedId(selectedIds, option.id))
                      }
                      className="hover:bg-muted flex min-h-7 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs/relaxed"
                    >
                      <span className="min-w-0 truncate">{option.name}</span>
                      <CheckIcon
                        className={cn(
                          "size-3.5 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

// Compact segmented toggle for mutually-exclusive filter values.
function SegmentedControl<T extends string>(args: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const { label, value, options, onChange, hint } = args;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="border-input bg-input/20 dark:bg-input/30 flex h-7 items-center gap-0.5 rounded-md border p-0.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex h-full min-w-0 flex-1 items-center justify-center rounded-sm px-1 text-xs font-medium transition-colors",
                option.disabled
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint ? (
        <span className="text-muted-foreground text-[11px]">{hint}</span>
      ) : (
        <span className="invisible text-[11px]" aria-hidden>
          &nbsp;
        </span>
      )}
    </div>
  );
}

function StatCard(args: {
  title: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  icon: React.ReactNode;
  tone?: "income" | "spending" | "neutral";
}) {
  const toneClass =
    args.tone === "income"
      ? "text-emerald-700 dark:text-emerald-300"
      : args.tone === "spending"
        ? "text-destructive"
        : "text-foreground";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-muted-foreground">{args.icon}</span>
          {args.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-xl font-semibold tabular-nums", toneClass)}>
          {args.value}
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {args.detail}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground flex h-72 items-center justify-center rounded-md border text-xs">
      No matching activity.
    </div>
  );
}

function formatHoverAmount(value: number) {
  return fmtAmount(value) ?? "$0.00";
}

type AxisPoint = { label: string; period: string };

// Splits a period key into its year and a compact, always-shown primary label
// (e.g. "Feb" for months, "Feb 3" for days/weeks). The year is appended
// separately only when it changes across the displayed ticks.
function periodAxisParts(period: string, groupBy: GroupBy) {
  const [year, month, day] = period.split("-").map((part) => Number(part));
  if (groupBy === "month") {
    return {
      year,
      primary: new Intl.DateTimeFormat("en", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(year, (month ?? 1) - 1, 1))),
    };
  }

  return {
    year,
    primary: new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))),
  };
}

// Roughly how much horizontal room a single tick label needs.
const TICK_PX_PER_LABEL = 64;
// Approximate horizontal space consumed by the y-axis + right margin.
const TICK_AXIS_GUTTER = 92;

// Picks a subset of ticks so ~one label renders per TICK_PX_PER_LABEL of width
// (every entry when there are few, every Nth when there are many), and labels
// each shown tick — appending the year only when it differs from the previous
// shown tick.
function buildAxisTicks(points: AxisPoint[], groupBy: GroupBy, width: number) {
  const count = points.length;
  if (count === 0) return null;

  const usableWidth = Math.max(120, (width || 640) - TICK_AXIS_GUTTER);
  const target = Math.max(
    2,
    Math.min(count, Math.floor(usableWidth / TICK_PX_PER_LABEL)),
  );
  const step = Math.max(1, Math.ceil(count / target));

  const tickvals: string[] = [];
  const ticktext: string[] = [];
  let prevYear: number | null = null;

  for (let i = 0; i < count; i += step) {
    const { year, primary } = periodAxisParts(points[i].period, groupBy);
    ticktext.push(prevYear === year ? primary : `${primary} ${year}`);
    tickvals.push(points[i].label);
    prevYear = year;
  }

  return { tickvals, ticktext };
}

// Tracks the rendered width of a chart container so tick density can adapt.
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

const DEFAULT_PLOT_THEME = {
  foreground: "#27272a",
  muted: "#78716c",
  border: "#e7e5e4",
  card: "#ffffff",
};

function usePlotTheme() {
  const [theme, setTheme] = useState(DEFAULT_PLOT_THEME);

  useEffect(() => {
    // Theme tokens are authored as oklch(), which Plotly's color parser cannot
    // read. Bounce each value through a probe element so the browser resolves
    // it to a concrete rgb()/rgba() string that Plotly understands.
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);

    function resolve(cssVar: string, fallback: string) {
      probe.style.color = fallback;
      probe.style.color = `var(${cssVar})`;
      const computed = getComputedStyle(probe).color;
      return computed?.startsWith("rgb") ? computed : fallback;
    }

    function readTheme() {
      setTheme({
        foreground: resolve("--foreground", DEFAULT_PLOT_THEME.foreground),
        muted: resolve("--muted-foreground", DEFAULT_PLOT_THEME.muted),
        border: resolve("--border", DEFAULT_PLOT_THEME.border),
        card: resolve("--popover", DEFAULT_PLOT_THEME.card),
      });
    }

    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      observer.disconnect();
      probe.remove();
    };
  }, []);

  return theme;
}

function basePlotLayout(
  theme: ReturnType<typeof usePlotTheme>,
  height: number,
): PlotParams["layout"] {
  return {
    height,
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: theme.foreground,
      family: "inherit",
      size: 11,
    },
    margin: { t: 14, r: 18, b: 86, l: 74 },
    legend: {
      orientation: "h",
      x: 0,
      y: -0.26,
      font: { color: theme.muted, size: 11 },
    },
    hoverlabel: {
      bgcolor: theme.card,
      bordercolor: theme.border,
      font: { color: theme.foreground, family: "inherit", size: 12 },
      align: "left",
    },
    hovermode: "x unified",
  };
}

// Inline charts: scroll-to-zoom is disabled so page scrolling (especially on
// touch devices) isn't hijacked while the pointer is over the chart.
const PLOT_CONFIG: PlotParams["config"] = {
  responsive: true,
  displaylogo: false,
  scrollZoom: false,
  displayModeBar: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
  toImageButtonOptions: {
    format: "png",
    filename: "ledger-analytics-chart",
    scale: 2,
  },
};

// Expanded charts live in a focused dialog where richer interaction is expected.
const PLOT_CONFIG_EXPANDED: PlotParams["config"] = {
  ...PLOT_CONFIG,
  scrollZoom: true,
  displayModeBar: true,
};

function PlotlyChart({
  data,
  layout,
  height,
  ariaLabel,
  fill = false,
  tickAxis,
}: {
  data: PlotParams["data"];
  layout: PlotParams["layout"];
  height: number;
  ariaLabel: string;
  fill?: boolean;
  tickAxis?: { points: AxisPoint[]; groupBy: GroupBy };
}) {
  const { ref, width } = useElementWidth();

  const resolvedLayout = useMemo(() => {
    const base = fill
      ? { ...layout, height: undefined, autosize: true }
      : layout;

    if (!tickAxis) return base;

    const ticks = buildAxisTicks(tickAxis.points, tickAxis.groupBy, width);
    if (!ticks) return base;

    return {
      ...base,
      xaxis: {
        ...base?.xaxis,
        tickmode: "array" as const,
        tickvals: ticks.tickvals,
        ticktext: ticks.ticktext,
        tickangle: 0,
      },
    } satisfies PlotParams["layout"];
  }, [fill, layout, tickAxis, width]);

  if (data.length === 0) return <EmptyChart />;

  return (
    <div
      ref={ref}
      className={cn("min-w-0", fill && "h-full")}
      role="img"
      aria-label={ariaLabel}
    >
      <Plot
        data={data}
        layout={resolvedLayout}
        config={fill ? PLOT_CONFIG_EXPANDED : PLOT_CONFIG}
        useResizeHandler
        style={{ width: "100%", height: fill ? "100%" : height }}
      />
    </div>
  );
}

function ExpandableChartCard({
  title,
  description,
  children,
  expandedChildren,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  expandedChildren: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setExpanded(true)}
              aria-label={`Expand ${title}`}
            >
              <Maximize2Icon />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="h-[min(88vh,54rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] sm:max-w-[min(96rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="h-full min-h-0">{expandedChildren}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Shared axis tick styling so every chart on the page reads the same way.
function mutedTickFont(theme: ReturnType<typeof usePlotTheme>) {
  return { color: theme.muted, size: 10 };
}

// Shared time (x) axis config. Every chart plots periods along x, so they all
// use the same muted ticks, no gridlines, and the same hover spike behaviour.
function timeAxis(theme: ReturnType<typeof usePlotTheme>) {
  return {
    title: { text: "" },
    automargin: true,
    tickfont: mutedTickFont(theme),
    showgrid: false,
    zeroline: false,
  };
}

function symlogAmount(value: number) {
  if (value === 0) return 0;
  return (
    Math.sign(value) * Math.log10(1 + Math.abs(value) / CASHFLOW_SYMLOG_SCALE)
  );
}

function compactAxisAmount(value: number) {
  const absolute = Math.abs(value);
  const formatted =
    absolute >= 1000
      ? `$${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`
      : `$${absolute.toFixed(0)}`;

  return value < 0 ? `(${formatted})` : formatted;
}

function cashflowAxisTicks(maxAmount: number) {
  const candidates = [
    100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000,
    500000, 1000000,
  ].filter((amount) => amount <= maxAmount);
  const step = Math.max(1, Math.ceil(candidates.length / 4));
  const selected = candidates.filter(
    (_, index) => index % step === 0 || index === candidates.length - 1,
  );
  const unique = Array.from(new Set(selected));

  return {
    tickvals: [
      ...[...unique].reverse().map((amount) => symlogAmount(-amount)),
      0,
      ...unique.map((amount) => symlogAmount(amount)),
    ],
    ticktext: [
      ...[...unique].reverse().map((amount) => compactAxisAmount(-amount)),
      "$0",
      ...unique.map((amount) => compactAxisAmount(amount)),
    ],
  };
}

// The period (x value) is supplied automatically as the unified hover header,
// so the body starts with the colored net accent to match the trend tooltip's
// colored series accents.
function cashflowNetHoverText(
  point: AnalyticsResponse["timeSeries"][number],
  theme: ReturnType<typeof usePlotTheme>,
) {
  const positive = point.net >= 0;
  const accent = positive ? CASHFLOW_POSITIVE : CASHFLOW_NEGATIVE;
  const heading = positive ? "Net gain" : "Net loss";
  return [
    `<b><span style="color:${accent}">${heading}: ${formatHoverAmount(point.net)}</span></b>`,
    `Income: ${formatHoverAmount(point.income)}`,
    `Spending: ${formatHoverAmount(-point.spending)}`,
    `<span style="color:${theme.muted}">${point.count.toLocaleString()} posting rows</span>`,
  ].join("<br>");
}

// Cashflow chart: one diverging bar per period showing the *net* movement.
// Because it plots net, equal-and-opposite flows within a period (e.g. a
// transfer that lands and leaves the same wallet) cancel out and no longer
// each claim their own slab of vertical space. Bar heights use a signed
// symlog transform so a $50 day and a $5k day are both legible.
function cashflowNetPlot(
  data: AnalyticsResponse["timeSeries"],
  theme: ReturnType<typeof usePlotTheme>,
  height: number,
) {
  if (data.length === 0) {
    return { data: [], layout: basePlotLayout(theme, height) };
  }

  const labels = data.map((point) => point.label);
  const barValues = data.map((point) => symlogAmount(point.net));
  const barColors = data.map((point) =>
    point.net >= 0 ? CASHFLOW_POSITIVE : CASHFLOW_NEGATIVE,
  );
  const hoverText = data.map((point) => cashflowNetHoverText(point, theme));

  const maxAbsNet = Math.max(1, ...data.map((point) => Math.abs(point.net)));
  const yMax = symlogAmount(maxAbsNet);
  const yTicks = cashflowAxisTicks(maxAbsNet);

  return {
    data: [
      {
        type: "bar",
        name: "Net",
        x: labels,
        y: barValues,
        // cornerradius is supported by plotly.js >= 2.20 but missing from the
        // shipped type defs, so we widen the marker type just for this prop.
        marker: {
          color: barColors,
          line: { width: 0 },
          cornerradius: 4,
        } as Partial<PlotMarker> & { cornerradius: number },
        hovertext: hoverText,
        hovertemplate: "%{hovertext}<extra></extra>",
      },
    ] satisfies PlotParams["data"],
    layout: {
      ...basePlotLayout(theme, height),
      bargap: 0.2,
      margin: { t: 10, r: 20, b: 52, l: 74 },
      showlegend: false,
      xaxis: timeAxis(theme),
      yaxis: {
        title: { text: "" },
        automargin: true,
        range: [-yMax * 1.08, yMax * 1.08],
        tickmode: "array",
        tickvals: yTicks.tickvals,
        ticktext: yTicks.ticktext,
        tickfont: mutedTickFont(theme),
        gridcolor: theme.border,
        zeroline: true,
        zerolinecolor: theme.muted,
        zerolinewidth: 1,
      },
    } satisfies PlotParams["layout"],
  };
}

function trendPlot(
  series: TrendSeries[],
  groupBy: GroupBy,
  theme: ReturnType<typeof usePlotTheme>,
  height: number,
) {
  const visible = series.slice(0, 6);
  if (visible.length === 0 || (visible[0]?.points.length ?? 0) === 0) {
    return { data: [], layout: basePlotLayout(theme, height) };
  }

  const rollingWindow = ROLLING_AVERAGE_WINDOWS[groupBy];

  return {
    data: visible.flatMap((item, index) => {
      const color = CHART_COLORS[index % CHART_COLORS.length];
      const x = item.points.map((point) => point.label);
      const cumulativeValues = item.points.map((point) => point.cumulative);
      const rollingValues = rollingAverageValues(
        cumulativeValues,
        rollingWindow,
      );
      const hasRollingAverageLine =
        rollingValues.filter((value) => value !== null).length >= 2;

      const averageTrace = {
        type: "scatter" as const,
        mode: "lines" as const,
        name: `${item.name} rolling average`,
        x,
        y: rollingValues,
        legendgroup: item.name,
        showlegend: false,
        hoverinfo: "skip" as const,
        line: {
          color,
          width: 1.75,
          dash: "dot" as const,
        },
        opacity: 0.55,
        connectgaps: false,
      } satisfies PlotData;

      const mainTrace = {
        type: "scatter" as const,
        mode: "lines" as const,
        name: item.name,
        x,
        y: cumulativeValues,
        legendgroup: item.name,
        line: {
          color,
          width: 2.75,
        },
        hovertext: item.points.map(
          (point) =>
            `<b><span style="color:${color}">${item.name}</span></b><br>Period net: ${formatHoverAmount(point.value)}<br>Cumulative: ${formatHoverAmount(point.cumulative)}`,
        ),
        hovertemplate: "%{hovertext}<extra></extra>",
      } satisfies PlotData;

      return hasRollingAverageLine ? [averageTrace, mainTrace] : [mainTrace];
    }) satisfies PlotParams["data"],
    layout: {
      ...basePlotLayout(theme, height),
      margin: { t: 10, r: 20, b: visible.length > 1 ? 62 : 40, l: 74 },
      showlegend: visible.length > 1,
      legend: {
        orientation: "h",
        x: 0,
        y: -0.18,
        yanchor: "top",
        font: { color: theme.muted, size: 11 },
      },
      xaxis: timeAxis(theme),
      yaxis: {
        title: { text: "Cumulative net" },
        automargin: true,
        tickprefix: "$",
        separatethousands: true,
        tickfont: mutedTickFont(theme),
        gridcolor: theme.border,
        zeroline: true,
        zerolinecolor: theme.muted,
        zerolinewidth: 1,
      },
    } satisfies PlotParams["layout"],
  };
}

function SpendingBars({
  rows,
  emptyLabel,
}: {
  rows: Array<{ name: string; spending: number; share: number; net: number }>;
  emptyLabel: string;
}) {
  const visible = rows.slice(0, 10);

  if (visible.length === 0) {
    return <div className="text-muted-foreground text-xs">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-3">
      {visible.map((row) => (
        <div key={row.name} className="grid gap-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium">{row.name}</span>
            <span className="shrink-0 tabular-nums">
              {fmtAmount(row.spending)}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-destructive/75 h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }}
            />
          </div>
          <div className="text-muted-foreground flex justify-between gap-3 text-[11px]">
            <span>{row.share.toFixed(1)}% of spending</span>
            <span className="tabular-nums">Net {fmtAmount(row.net)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchId = useId();
  const minAmountId = useId();
  const maxAmountId = useId();
  const dateRangeId = useId();

  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 640px)").matches;
  });
  const [filters, setFilters] = useState<AnalyticsFilters>(
    DEFAULT_ANALYTICS_FILTERS,
  );
  const [filterDraft, setFilterDraft] =
    useState<AnalyticsFilterDraft>(DEFAULT_FILTER_DRAFT);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const plotTheme = usePlotTheme();

  const dataBounds = useMemo(
    () => ({
      first: analytics?.range.firstTransactionAt ?? null,
      last: analytics?.range.lastTransactionAt ?? null,
    }),
    [analytics?.range.firstTransactionAt, analytics?.range.lastTransactionAt],
  );

  const granularityState = useMemo(
    () =>
      groupByForGranularity(
        filterDraft.datePreset,
        filterDraft.startDate,
        filterDraft.endDate,
        filterDraft.granularityLevel,
        dataBounds.first,
        dataBounds.last,
      ),
    [
      filterDraft.datePreset,
      filterDraft.startDate,
      filterDraft.endDate,
      filterDraft.granularityLevel,
      dataBounds.first,
      dataBounds.last,
    ],
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
    [filters],
  );
  const filtersDirty = useMemo(() => {
    try {
      return (
        analyticsFiltersKey(draftToFilters(filterDraft)) !==
        analyticsFiltersKey(filters)
      );
    } catch {
      return true;
    }
  }, [filterDraft, filters]);

  const loadAnalytics = useCallback(
    async (
      nextFilters: AnalyticsFilters,
      options?: { fullScreen?: boolean },
    ) => {
      if (options?.fullScreen) {
        setLoading(true);
      } else {
        setPageLoading(true);
      }

      try {
        const boot = await apiJson<BootstrapResponse>("/api/bootstrap", {
          method: "POST",
          body: "{}",
        });
        if (boot.migration?.required) {
          router.replace(boot.migration.redirectTo);
          return;
        }

        if (boot.onboarding?.required) {
          router.replace(boot.onboarding.redirectTo);
          return;
        }

        const [walletsRes, fundsRes, analyticsRes] = await Promise.all([
          apiJson<{ wallets: Wallet[] }>("/api/wallets?summary=false"),
          apiJson<{ funds: Fund[] }>("/api/funds?summary=false"),
          apiJson<AnalyticsResponse>(buildAnalyticsUrl(nextFilters)),
        ]);

        setWallets(walletsRes.wallets);
        setFunds(fundsRes.funds);
        setAnalytics(analyticsRes);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load analytics",
        );
      } finally {
        if (options?.fullScreen) {
          setLoading(false);
        } else {
          setPageLoading(false);
        }
      }
    },
    [router],
  );

  const applyFilters = useCallback(async () => {
    try {
      const syncedDraft = syncGranularityDraft(
        filterDraft,
        dataBounds.first,
        dataBounds.last,
      );
      setFilterDraft(syncedDraft);
      const nextFilters = draftToFilters(syncedDraft);
      setFilters(nextFilters);
      await loadAnalytics(nextFilters);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid filters");
    }
  }, [dataBounds.first, dataBounds.last, filterDraft, loadAnalytics]);

  const resetFilters = useCallback(async () => {
    setFilters(DEFAULT_ANALYTICS_FILTERS);
    setFilterDraft(DEFAULT_FILTER_DRAFT);
    await loadAnalytics(DEFAULT_ANALYTICS_FILTERS);
  }, [loadAnalytics]);

  const patchFilterDraft = useCallback(
    (patch: Partial<AnalyticsFilterDraft>) => {
      setFilterDraft((prev) => {
        const next = { ...prev, ...patch };
        if (
          "datePreset" in patch ||
          "startDate" in patch ||
          "endDate" in patch ||
          "granularityLevel" in patch
        ) {
          return syncGranularityDraft(next, dataBounds.first, dataBounds.last, {
            preferLevel:
              "granularityLevel" in patch
                ? (patch.granularityLevel ?? next.granularityLevel)
                : next.granularityLevel,
          });
        }
        return next;
      });
    },
    [dataBounds.first, dataBounds.last],
  );

  useEffect(() => {
    if (!dataBounds.first && !dataBounds.last) return;

    setFilterDraft((prev) => {
      const synced = syncGranularityDraft(
        prev,
        dataBounds.first,
        dataBounds.last,
      );
      if (
        synced.granularityLevel === prev.granularityLevel &&
        synced.groupBy === prev.groupBy
      ) {
        return prev;
      }
      return synced;
    });
  }, [dataBounds.first, dataBounds.last]);

  useEffect(() => {
    router.prefetch("/tracker");
    router.prefetch("/tracker/transactions");
    router.prefetch("/tracker/funds");
    router.prefetch("/tracker/wallets");
  }, [router]);

  useEffect(() => {
    void loadAnalytics(DEFAULT_ANALYTICS_FILTERS, { fullScreen: true });
    // Mount-only initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  const summary = analytics?.summary;
  const groupBy = analytics?.groupBy ?? "month";
  const timeSeries = analytics?.timeSeries ?? [];
  const cashflowNetChart = cashflowNetPlot(timeSeries, plotTheme, 360);
  const walletTrendChart = trendPlot(
    analytics?.walletSeries ?? [],
    groupBy,
    plotTheme,
    360,
  );
  const fundTrendChart = trendPlot(
    analytics?.fundSeries ?? [],
    groupBy,
    plotTheme,
    360,
  );
  const cashflowNetTickAxis = { points: timeSeries, groupBy };
  const walletTickAxis = {
    points: analytics?.walletSeries?.[0]?.points ?? [],
    groupBy,
  };
  const fundTickAxis = {
    points: analytics?.fundSeries?.[0]?.points ?? [],
    groupBy,
  };
  const netTone =
    summary && summary.net > 0
      ? "income"
      : summary && summary.net < 0
        ? "spending"
        : "neutral";
  const activeFilterLabel =
    activeFilterCount === 0
      ? "No filters applied"
      : `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`;
  const spendingRate =
    summary && summary.income > 0
      ? (summary.spending / summary.income) * 100
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Trends, subtotals, and categorized movement from existing
            transactions.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadAnalytics(filters)}
          disabled={pageLoading}
        >
          <RefreshCwIcon className={cn(pageLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>{activeFilterLabel}</CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={filtersExpanded}
              aria-controls="analytics-filters-panel"
              onClick={() => setFiltersExpanded((expanded) => !expanded)}
            >
              <ListFilterIcon />
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDownIcon
                className={cn(
                  "text-muted-foreground transition-transform duration-200",
                  filtersExpanded && "rotate-180",
                )}
              />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void applyFilters();
            }}
            id="analytics-filters-panel"
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-in-out",
              filtersExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={searchId}>Search</Label>
                  <div className="relative">
                    <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                    <Input
                      id={searchId}
                      value={filterDraft.search}
                      onChange={(event) =>
                        patchFilterDraft({ search: event.target.value })
                      }
                      placeholder="Description, fund, wallet"
                      className="pl-7"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={dateRangeId}>Date range</Label>
                    <Select
                      value={filterDraft.datePreset}
                      onValueChange={(value) =>
                        patchFilterDraft({
                          datePreset: value as DateRangePreset,
                          ...dateRangeForPreset(value as DateRangePreset),
                        })
                      }
                    >
                      <SelectTrigger id={dateRangeId} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_RANGE_PRESETS.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <SegmentedControl<GranularityLevel>
                    label="Detail"
                    value={filterDraft.granularityLevel}
                    onChange={(granularityLevel) =>
                      patchFilterDraft({ granularityLevel })
                    }
                    options={GRANULARITY_LEVELS.map((level) => ({
                      value: level.value,
                      label: level.label,
                      disabled: granularityState.slots[level.value].disabled,
                    }))}
                  />

                  <SegmentedControl<TransactionPendingFilter>
                    label="Status"
                    value={filterDraft.pendingStatus}
                    onChange={(pendingStatus) =>
                      patchFilterDraft({ pendingStatus })
                    }
                    options={[
                      { value: "all", label: "All" },
                      { value: "pending", label: "Pending" },
                      { value: "cleared", label: "Cleared" },
                    ]}
                  />
                  <SegmentedControl<TransactionIncomeFilter>
                    label="Type"
                    value={filterDraft.income}
                    onChange={(income) => patchFilterDraft({ income })}
                    options={[
                      { value: "all", label: "All" },
                      { value: "income", label: "Income" },
                      { value: "not_income", label: "Expense" },
                    ]}
                  />
                  <SegmentedControl<TransactionDirectionFilter>
                    label="Direction"
                    value={filterDraft.direction}
                    onChange={(direction) => patchFilterDraft({ direction })}
                    options={[
                      { value: "all", label: "All" },
                      { value: "in", label: "In" },
                      { value: "out", label: "Out" },
                    ]}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={minAmountId}>Minimum</Label>
                    <Input
                      id={minAmountId}
                      inputMode="decimal"
                      value={filterDraft.minAmount}
                      onChange={(event) =>
                        patchFilterDraft({ minAmount: event.target.value })
                      }
                      placeholder="$0"
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={maxAmountId}>Maximum</Label>
                    <Input
                      id={maxAmountId}
                      inputMode="decimal"
                      value={filterDraft.maxAmount}
                      onChange={(event) =>
                        patchFilterDraft({ maxAmount: event.target.value })
                      }
                      placeholder="Any"
                    />
                  </div>

                  <div className="xl:col-span-2">
                    <MultiSelectDropdown
                      label="Funds"
                      allLabel="All funds"
                      options={funds}
                      selectedIds={filterDraft.fundIds}
                      onChange={(fundIds) => patchFilterDraft({ fundIds })}
                    />
                  </div>

                  <div className="xl:col-span-2">
                    <MultiSelectDropdown
                      label="Wallets"
                      allLabel="All wallets"
                      options={wallets}
                      selectedIds={filterDraft.walletIds}
                      onChange={(walletIds) => patchFilterDraft({ walletIds })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-border mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={pageLoading || !filtersDirty}>
                    <SearchIcon />
                    {filtersDirty ? "Apply" : "Applied"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void resetFilters()}
                    disabled={
                      pageLoading || (activeFilterCount === 0 && !filtersDirty)
                    }
                  >
                    <XIcon />
                    Reset
                  </Button>
                </div>
                <span className="text-muted-foreground text-xs">
                  {activeFilterLabel}
                </span>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div
        className={cn(
          "flex flex-col gap-6 transition-opacity duration-200",
          pageLoading && "pointer-events-none opacity-60",
        )}
        aria-busy={pageLoading}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Net"
            value={fmtAmount(summary?.net ?? 0)}
            detail={`${(summary?.count ?? 0).toLocaleString()} posting rows`}
            icon={<BarChart3Icon className="size-4" />}
            tone={netTone}
          />
          <StatCard
            title="Income"
            value={fmtAmount(summary?.income ?? 0)}
            detail="Positive movement"
            icon={<TrendingUpIcon className="size-4" />}
            tone="income"
          />
          <StatCard
            title="Spending"
            value={fmtAmount(summary?.spending ?? 0)}
            detail={`${spendingRate.toFixed(1)}% of income`}
            icon={<TrendingDownIcon className="size-4" />}
            tone="spending"
          />
          <StatCard
            title="Pending"
            value={fmtAmount(summary?.pending ?? 0)}
            detail={`Cleared ${fmtAmount(summary?.cleared ?? 0)}`}
            icon={<WalletCardsIcon className="size-4" />}
            tone="neutral"
          />
        </div>

        <ExpandableChartCard
          title="Cashflow"
          expandedChildren={
            <PlotlyChart
              data={cashflowNetChart.data}
              layout={cashflowNetChart.layout}
              height={680}
              fill
              tickAxis={cashflowNetTickAxis}
              ariaLabel="Expanded cashflow chart"
            />
          }
        >
          <PlotlyChart
            data={cashflowNetChart.data}
            layout={cashflowNetChart.layout}
            height={360}
            tickAxis={cashflowNetTickAxis}
            ariaLabel="Cashflow chart"
          />
        </ExpandableChartCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <ExpandableChartCard
            title="Wallet Trend"
            expandedChildren={
              <PlotlyChart
                data={walletTrendChart.data}
                layout={walletTrendChart.layout}
                height={680}
                fill
                tickAxis={walletTickAxis}
                ariaLabel="Expanded wallet trend chart"
              />
            }
          >
            <PlotlyChart
              data={walletTrendChart.data}
              layout={walletTrendChart.layout}
              height={360}
              tickAxis={walletTickAxis}
              ariaLabel="Wallet trend chart"
            />
          </ExpandableChartCard>

          <ExpandableChartCard
            title="Fund Trend"
            expandedChildren={
              <PlotlyChart
                data={fundTrendChart.data}
                layout={fundTrendChart.layout}
                height={680}
                fill
                tickAxis={fundTickAxis}
                ariaLabel="Expanded fund trend chart"
              />
            }
          >
            <PlotlyChart
              data={fundTrendChart.data}
              layout={fundTrendChart.layout}
              height={360}
              tickAxis={fundTickAxis}
              ariaLabel="Fund trend chart"
            />
          </ExpandableChartCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Categorized Spending</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBars
                rows={analytics?.categorizedSpending ?? []}
                emptyLabel="No categorized spending in this selection."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wallet Spending</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBars
                rows={analytics?.walletSpending ?? []}
                emptyLabel="No wallet spending in this selection."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
