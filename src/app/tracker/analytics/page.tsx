"use client";

import {
  BarChart3Icon,
  ChevronDownIcon,
  ListFilterIcon,
  RefreshCwIcon,
  SearchIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
import {
  ExpandableChartCard,
  PlotlyChart,
  SpendingBars,
  StatCard,
  TrendModeToggle,
  cashflowNetPlot,
  trendPlot,
  usePlotTheme,
} from "@/app/tracker/analytics/charts";
import {
  DATE_RANGE_PRESETS,
  GRANULARITY_LEVELS,
  dateRangeForPreset,
  groupByForGranularity,
  syncGranularityDraft,
} from "@/app/tracker/analytics/lib/granularity";
import {
  analyticsFiltersKey,
  buildAnalyticsUrl,
  countActiveFilters,
  createDefaultAnalyticsFilters,
  createDefaultFilterDraft,
  draftToFilters,
  isDefaultAnalyticsFilters,
} from "@/app/tracker/analytics/lib/filters";
import type {
  AnalyticsFilterDraft,
  AnalyticsFilters,
  AnalyticsResponse,
  DateRangePreset,
  GranularityLevel,
  TrendMode,
} from "@/app/tracker/analytics/types";
import {
  AmountAndAccountFilters,
  FilterSearchField,
  SegmentedControl,
  StatusTypeDirectionControls,
} from "@/app/tracker/components/filter-controls";
import { apiJson } from "@/app/tracker/lib/api";
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import { fmtAmount } from "@/app/tracker/lib/format";
import type { Fund, Wallet } from "@/app/tracker/types";
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
  const [filters, setFilters] = useState<AnalyticsFilters>(() =>
    createDefaultAnalyticsFilters(),
  );
  const [filterDraft, setFilterDraft] = useState<AnalyticsFilterDraft>(() =>
    createDefaultFilterDraft(),
  );
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [trendMode, setTrendMode] = useState<TrendMode>("cumulative");
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
        const ready = await checkBootstrapOrRedirect(router);
        if (!ready) return;

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
    const defaults = createDefaultAnalyticsFilters();
    const defaultDraft = createDefaultFilterDraft();
    setFilters(defaults);
    setFilterDraft(defaultDraft);
    await loadAnalytics(defaults);
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
    void loadAnalytics(createDefaultAnalyticsFilters(), { fullScreen: true });
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
    trendMode,
  );
  const fundTrendChart = trendPlot(
    analytics?.fundSeries ?? [],
    groupBy,
    plotTheme,
    360,
    trendMode,
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
            inert={!filtersExpanded}
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-in-out",
              filtersExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-3">
                <FilterSearchField
                  id={searchId}
                  value={filterDraft.search}
                  onChange={(search) => patchFilterDraft({ search })}
                />

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

                  <StatusTypeDirectionControls
                    draft={filterDraft}
                    onPatch={patchFilterDraft}
                  />
                </div>

                <AmountAndAccountFilters
                  draft={filterDraft}
                  onPatch={patchFilterDraft}
                  funds={funds}
                  wallets={wallets}
                  minAmountId={minAmountId}
                  maxAmountId={maxAmountId}
                />
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
                      pageLoading ||
                      (isDefaultAnalyticsFilters(filters) && !filtersDirty)
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
            detail={`Income minus spending · ${(summary?.count ?? 0).toLocaleString()} transactions`}
            icon={<BarChart3Icon className="size-4" />}
            tone={netTone}
          />
          <StatCard
            title="Income"
            value={fmtAmount(summary?.income ?? 0)}
            detail="Money coming in"
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
          title="Cash flow"
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
            ariaLabel="Cash flow chart"
          />
        </ExpandableChartCard>

        <section className="space-y-2">
          <div className="flex justify-end">
            <TrendModeToggle value={trendMode} onChange={setTrendMode} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ExpandableChartCard
              title="Wallet trend"
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
              title="Fund trend"
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
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Wallet spending</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBars
                rows={analytics?.walletSpending ?? []}
                emptyLabel="No wallet spending in this selection."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fund spending</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBars
                rows={analytics?.categorizedSpending ?? []}
                emptyLabel="No fund spending in this selection."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
