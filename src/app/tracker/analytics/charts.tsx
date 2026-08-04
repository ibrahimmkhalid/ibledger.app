"use client";

import dynamic from "next/dynamic";
import { Maximize2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtAmount } from "@/app/tracker/lib/format";
import { keyToColorIndex, seriesColor } from "@/app/tracker/lib/series-colors";
import type {
  AxisPoint,
  GroupBy,
  AnalyticsResponse,
  TrendMode,
  TrendSeries,
} from "@/app/tracker/analytics/types";
import type { PlotMarker } from "plotly.js";
import type { PlotParams } from "react-plotly.js";

type PlotData = NonNullable<PlotParams["data"]>[number];

const Plot = dynamic<PlotParams>(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="border-border bg-muted/20 text-muted-foreground flex h-72 items-center justify-center rounded-md border text-xs">
      Loading chart…
    </div>
  ),
});
const TREND_MODE_OPTIONS: ReadonlyArray<{
  value: TrendMode;
  label: string;
}> = [
  { value: "cumulative", label: "Change" },
  { value: "raw", label: "Value" },
];

const CASHFLOW_SYMLOG_SCALE = 100;

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
export function TrendModeToggle({
  value,
  onChange,
}: {
  value: TrendMode;
  onChange: (value: TrendMode) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-muted-foreground text-2xs font-medium">View</span>
      <div
        role="group"
        aria-label="Trend view"
        className="border-input bg-input/20 dark:bg-input/30 inline-flex h-6 items-center gap-0.5 rounded-md border p-0.5"
      >
        {TREND_MODE_OPTIONS.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "text-2xs flex h-full items-center rounded-sm px-2 font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatCard(args: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: "income" | "spending" | "neutral";
}) {
  const toneClass =
    args.tone === "income"
      ? "text-income"
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
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground flex h-72 items-center justify-center rounded-md border text-xs">
      Nothing to chart for this selection.
    </div>
  );
}

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
  income: "#059669",
  destructive: "#e05260",
};

export function usePlotTheme() {
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
        income: resolve("--income", DEFAULT_PLOT_THEME.income),
        destructive: resolve("--destructive", DEFAULT_PLOT_THEME.destructive),
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

export function PlotlyChart({
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

export function ExpandableChartCard({
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
        <DialogContent
          {...(description ? {} : { "aria-describedby": undefined })}
          className="h-[min(88vh,54rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] sm:max-w-[min(96rem,calc(100vw-2rem))]"
        >
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
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
    250000, 500000, 1000000,
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
  const accent = positive ? theme.income : theme.destructive;
  const heading = positive ? "Net gain" : "Net loss";
  return [
    `<b><span style="color:${accent}">${heading}: ${fmtAmount(point.net)}</span></b>`,
    `Income: ${fmtAmount(point.income)}`,
    `Spending: ${fmtAmount(-point.spending)}`,
    `<span style="color:${theme.muted}">${point.count.toLocaleString()} transactions</span>`,
  ].join("<br>");
}

// Cashflow chart: one diverging bar per period showing the *net* movement.
// Because it plots net, equal-and-opposite flows within a period (e.g. a
// transfer that lands and leaves the same wallet) cancel out and no longer
// each claim their own slab of vertical space. Bar heights use a signed
// symlog transform so a $50 day and a $5k day are both legible.
export function cashflowNetPlot(
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
    point.net >= 0 ? theme.income : theme.destructive,
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

export function trendPlot(
  series: TrendSeries[],
  groupBy: GroupBy,
  theme: ReturnType<typeof usePlotTheme>,
  height: number,
  mode: TrendMode,
) {
  const visible = series
    .filter((item) =>
      item.points.some((point) =>
        mode === "raw" ? point.raw !== 0 : point.value !== 0,
      ),
    )
    .slice(0, 6);
  if (visible.length === 0 || (visible[0]?.points.length ?? 0) === 0) {
    return { data: [], layout: basePlotLayout(theme, height) };
  }

  const rollingWindow = ROLLING_AVERAGE_WINDOWS[groupBy];
  const valueLabel = mode === "raw" ? "Value" : "Cumulative change";

  return {
    data: visible.flatMap((item) => {
      const color = seriesColor(keyToColorIndex(String(item.id))).bg;
      const x = item.points.map((point) => point.label);
      const values = item.points.map((point) =>
        mode === "raw" ? point.raw : point.cumulative,
      );
      const rollingValues = rollingAverageValues(values, rollingWindow);
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
        y: values,
        legendgroup: item.name,
        line: {
          color,
          width: 2.75,
        },
        hovertext: item.points.map(
          (point) =>
            `<b><span style="color:${color}">${item.name}</span></b><br>Period net: ${fmtAmount(point.value)}<br>${valueLabel}: ${fmtAmount(mode === "raw" ? point.raw : point.cumulative)}`,
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
        title: { text: mode === "raw" ? "Value" : "Cumulative net" },
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

export function SpendingBars({
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
          <div className="text-muted-foreground text-2xs flex justify-between gap-3">
            <span>{row.share.toFixed(1)}% of spending</span>
            <span className="tabular-nums">Net {fmtAmount(row.net)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
