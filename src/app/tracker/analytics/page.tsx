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
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic<PlotParams>(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="border-border bg-muted/20 text-muted-foreground flex h-72 items-center justify-center rounded-md border text-xs">
      Loading chart.
    </div>
  ),
});

type GroupBy = "day" | "week" | "month";

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
};

const CHART_COLORS = [
  "#06b6d4",
  "#e05260",
  "#7c3aed",
  "#f59e0b",
  "#10b981",
  "#64748b",
];

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
  if (filters.groupBy !== "month") count += 1;
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

function usePlotTheme() {
  const [theme, setTheme] = useState({
    foreground: "#27272a",
    muted: "#78716c",
    border: "#e7e5e4",
    card: "rgba(0,0,0,0)",
  });

  useEffect(() => {
    function readTheme() {
      const styles = getComputedStyle(document.documentElement);
      setTheme({
        foreground: styles.getPropertyValue("--foreground").trim() || "#27272a",
        muted:
          styles.getPropertyValue("--muted-foreground").trim() || "#78716c",
        border: styles.getPropertyValue("--border").trim() || "#e7e5e4",
        card: styles.getPropertyValue("--card").trim() || "rgba(0,0,0,0)",
      });
    }

    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
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
      font: { color: theme.foreground, family: "inherit" },
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
  description: string;
  children: React.ReactNode;
  expandedChildren: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
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
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="h-full min-h-0">{expandedChildren}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function incomeSpendingPlot(
  data: AnalyticsResponse["timeSeries"],
  theme: ReturnType<typeof usePlotTheme>,
  height: number,
) {
  if (data.length === 0) {
    return { data: [], layout: basePlotLayout(theme, height) };
  }

  const labels = data.map((point) => point.label);
  const incomeText = data.map(
    (point) =>
      `${point.label}<br>Income: ${formatHoverAmount(point.income)}<br>Net: ${formatHoverAmount(point.net)}`,
  );
  const spendingText = data.map(
    (point) =>
      `${point.label}<br>Spending: ${formatHoverAmount(point.spending)}<br>Net: ${formatHoverAmount(point.net)}`,
  );

  return {
    data: [
      {
        type: "bar",
        name: "Income",
        x: labels,
        y: data.map((point) => point.income),
        marker: { color: CHART_COLORS[0], line: { width: 0 } },
        text: undefined,
        textposition: "none",
        hovertext: incomeText,
        hovertemplate: "%{hovertext}<extra></extra>",
      },
      {
        type: "bar",
        name: "Spending",
        x: labels,
        y: data.map((point) => point.spending),
        marker: { color: CHART_COLORS[1], line: { width: 0 } },
        text: undefined,
        textposition: "none",
        hovertext: spendingText,
        hovertemplate: "%{hovertext}<extra></extra>",
      },
    ] satisfies PlotParams["data"],
    layout: {
      ...basePlotLayout(theme, height),
      barmode: "group",
      bargap: 0.28,
      xaxis: {
        title: { text: "" },
        automargin: true,
        tickangle: data.length > 6 ? -35 : 0,
        tickfont: { color: theme.muted, size: 10 },
        gridcolor: theme.border,
      },
      yaxis: {
        title: { text: "Amount" },
        automargin: true,
        tickprefix: "$",
        separatethousands: true,
        gridcolor: theme.border,
        zerolinecolor: theme.border,
      },
    } satisfies PlotParams["layout"],
  };
}

function trendPlot(
  series: TrendSeries[],
  theme: ReturnType<typeof usePlotTheme>,
  height: number,
) {
  const visible = series.slice(0, 6);
  if (visible.length === 0 || (visible[0]?.points.length ?? 0) === 0) {
    return { data: [], layout: basePlotLayout(theme, height) };
  }

  return {
    data: visible.map((item, index) => ({
      type: "scatter",
      mode: "lines+markers",
      name: item.name,
      x: item.points.map((point) => point.label),
      y: item.points.map((point) => point.cumulative),
      line: {
        color: CHART_COLORS[index % CHART_COLORS.length],
        width: 2.5,
      },
      marker: {
        color: CHART_COLORS[index % CHART_COLORS.length],
        size: 6,
      },
      hovertext: item.points.map(
        (point) =>
          `${item.name}<br>${point.label}<br>Period net: ${formatHoverAmount(point.value)}<br>Cumulative: ${formatHoverAmount(point.cumulative)}`,
      ),
      hovertemplate: "%{hovertext}<extra></extra>",
    })) satisfies PlotParams["data"],
    layout: {
      ...basePlotLayout(theme, height),
      xaxis: {
        title: { text: "" },
        automargin: true,
        tickangle: visible[0].points.length > 6 ? -35 : 0,
        tickfont: { color: theme.muted, size: 10 },
        gridcolor: theme.border,
      },
      yaxis: {
        title: { text: "Cumulative net" },
        automargin: true,
        tickprefix: "$",
        separatethousands: true,
        gridcolor: theme.border,
        zeroline: true,
        zerolinecolor: theme.border,
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
  const max = Math.max(1, ...visible.map((row) => row.spending));

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
              style={{ width: `${Math.max(3, (row.spending / max) * 100)}%` }}
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
  const startDateId = useId();
  const endDateId = useId();
  const pendingStatusId = useId();
  const incomeFilterId = useId();
  const directionFilterId = useId();
  const groupById = useId();

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
          apiJson<{ wallets: Wallet[] }>("/api/wallets"),
          apiJson<{ funds: Fund[] }>("/api/funds"),
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
      const nextFilters = draftToFilters(filterDraft);
      setFilters(nextFilters);
      await loadAnalytics(nextFilters);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid filters");
    }
  }, [filterDraft, loadAnalytics]);

  const resetFilters = useCallback(async () => {
    setFilters(DEFAULT_ANALYTICS_FILTERS);
    setFilterDraft(DEFAULT_FILTER_DRAFT);
    await loadAnalytics(DEFAULT_ANALYTICS_FILTERS);
  }, [loadAnalytics]);

  const patchFilterDraft = useCallback(
    (patch: Partial<AnalyticsFilterDraft>) => {
      setFilterDraft((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

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
  const incomeChart = incomeSpendingPlot(
    analytics?.timeSeries ?? [],
    plotTheme,
    360,
  );
  const walletTrendChart = trendPlot(
    analytics?.walletSeries ?? [],
    plotTheme,
    360,
  );
  const fundTrendChart = trendPlot(analytics?.fundSeries ?? [], plotTheme, 360);
  const incomeTickAxis = { points: analytics?.timeSeries ?? [], groupBy };
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="flex min-w-0 flex-col gap-1.5 xl:col-span-2">
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

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={pendingStatusId}>Status</Label>
                  <Select
                    value={filterDraft.pendingStatus}
                    onValueChange={(value) =>
                      patchFilterDraft({
                        pendingStatus: value as TransactionPendingFilter,
                      })
                    }
                  >
                    <SelectTrigger id={pendingStatusId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cleared">Cleared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={incomeFilterId}>Type</Label>
                  <Select
                    value={filterDraft.income}
                    onValueChange={(value) =>
                      patchFilterDraft({
                        income: value as TransactionIncomeFilter,
                      })
                    }
                  >
                    <SelectTrigger id={incomeFilterId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="not_income">Not income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={directionFilterId}>Direction</Label>
                  <Select
                    value={filterDraft.direction}
                    onValueChange={(value) =>
                      patchFilterDraft({
                        direction: value as TransactionDirectionFilter,
                      })
                    }
                  >
                    <SelectTrigger id={directionFilterId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="in">In</SelectItem>
                      <SelectItem value="out">Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={groupById}>Group</Label>
                  <Select
                    value={filterDraft.groupBy}
                    onValueChange={(value) =>
                      patchFilterDraft({ groupBy: value as GroupBy })
                    }
                  >
                    <SelectTrigger id={groupById} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={startDateId}>Start</Label>
                  <Input
                    id={startDateId}
                    type="date"
                    value={filterDraft.startDate}
                    onChange={(event) =>
                      patchFilterDraft({ startDate: event.target.value })
                    }
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={endDateId}>End</Label>
                  <Input
                    id={endDateId}
                    type="date"
                    value={filterDraft.endDate}
                    onChange={(event) =>
                      patchFilterDraft({ endDate: event.target.value })
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <MultiSelectDropdown
                    label="Funds"
                    allLabel="All funds"
                    options={funds}
                    selectedIds={filterDraft.fundIds}
                    onChange={(fundIds) => patchFilterDraft({ fundIds })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <MultiSelectDropdown
                    label="Wallets"
                    allLabel="All wallets"
                    options={wallets}
                    selectedIds={filterDraft.walletIds}
                    onChange={(walletIds) => patchFilterDraft({ walletIds })}
                  />
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
          title="Income vs Spending"
          description="Positive and negative movement by selected period."
          expandedChildren={
            <PlotlyChart
              data={incomeChart.data}
              layout={incomeChart.layout}
              height={680}
              fill
              tickAxis={incomeTickAxis}
              ariaLabel="Expanded income and spending chart"
            />
          }
        >
          <PlotlyChart
            data={incomeChart.data}
            layout={incomeChart.layout}
            height={360}
            tickAxis={incomeTickAxis}
            ariaLabel="Income and spending chart"
          />
        </ExpandableChartCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <ExpandableChartCard
            title="Wallet Trend"
            description="Running net movement for the most active wallets."
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
            description="Running net movement for the most active funds."
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
              <CardDescription>
                Funds ranked by outgoing movement.
              </CardDescription>
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
              <CardDescription>
                Wallets ranked by outgoing movement.
              </CardDescription>
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
