"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ListFilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

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

import {
  AmountAndAccountFilters,
  FilterSearchField,
  StatusTypeDirectionControls,
  countActiveTransactionFilters,
  formatFilterAmount,
  parseFilterAmount,
} from "@/app/tracker/components/filter-controls";
import { EventModals } from "@/app/tracker/components/event-modals";
import {
  AddTransactionFab,
  TrackerActions,
} from "@/app/tracker/components/tracker-actions";
import { useConfirm } from "@/app/tracker/components/confirm-dialog";
import { TransactionsSkeleton } from "@/app/tracker/components/loading-skeletons";
import { TransactionsPagination } from "@/app/tracker/components/transactions-pagination";
import { TransactionEventCard } from "@/app/tracker/components/transaction-event-card";
import { apiJson } from "@/app/tracker/lib/api";
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  appendTransactionFilterParams,
  fetchTransactionsPage,
  getAdjacentPages,
  normalizeTransactionsFilters,
  transactionsFiltersCacheKey,
  transactionsPageCacheKey,
  type TransactionsPageFilters,
  type TransactionsPageQuery,
} from "@/app/tracker/lib/transactions-page-query";
import type {
  EventsResponse,
  Fund,
  TransactionEvent,
  TransactionsPageSize,
  Wallet,
} from "@/app/tracker/types";
import { TRANSACTIONS_PAGE_SIZE_OPTIONS } from "@/app/tracker/types";

const DEFAULT_PAGE_SIZE: TransactionsPageSize = 20;

type TransactionsFilterDraft = Omit<
  TransactionsPageFilters,
  "minAmount" | "maxAmount"
> & {
  minAmount: string;
  maxAmount: string;
};

const DEFAULT_FILTER_DRAFT: TransactionsFilterDraft = {
  ...DEFAULT_TRANSACTIONS_FILTERS,
  minAmount: "",
  maxAmount: "",
};

function filtersToDraft(
  filters: TransactionsPageFilters,
): TransactionsFilterDraft {
  return {
    ...filters,
    minAmount: formatFilterAmount(filters.minAmount),
    maxAmount: formatFilterAmount(filters.maxAmount),
  };
}

function draftToFilters(
  draft: TransactionsFilterDraft,
): TransactionsPageFilters {
  const minAmount = parseFilterAmount(draft.minAmount, "Minimum");
  const maxAmount = parseFilterAmount(draft.maxAmount, "Maximum");

  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    throw new Error("Minimum amount cannot exceed maximum amount");
  }

  return normalizeTransactionsFilters({
    ...draft,
    minAmount,
    maxAmount,
  });
}

function applyEventsResponse(
  response: EventsResponse,
  setters: {
    setEvents: (events: TransactionEvent[]) => void;
    setPage: (page: number) => void;
    setTotalPages: (totalPages: number) => void;
    setTotalCount: (totalCount: number) => void;
    setPageSize: (pageSize: TransactionsPageSize) => void;
  },
) {
  setters.setEvents(response.events);
  setters.setPage(response.currentPage);
  setters.setTotalPages(response.totalPages);
  setters.setTotalCount(response.totalCount);
  setters.setPageSize(response.pageSize as TransactionsPageSize);
}

export default function TransactionsPage() {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const pageSizeId = useId();
  const searchId = useId();
  const minAmountId = useId();
  const maxAmountId = useId();

  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const [filters, setFilters] = useState<TransactionsPageFilters>(
    DEFAULT_TRANSACTIONS_FILTERS,
  );
  const [filterDraft, setFilterDraft] =
    useState<TransactionsFilterDraft>(DEFAULT_FILTER_DRAFT);
  const [pageSize, setPageSize] =
    useState<TransactionsPageSize>(DEFAULT_PAGE_SIZE);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 640px)").matches;
  });
  const [createTransactionOpen, setCreateTransactionOpen] = useState(false);
  const [createIncomeOpen, setCreateIncomeOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<TransactionEvent | null>(
    null,
  );

  const pageCacheRef = useRef(new Map<string, EventsResponse>());
  const preloadInFlightRef = useRef(new Set<string>());

  const activeFilterCount = useMemo(
    () => countActiveTransactionFilters(filters),
    [filters],
  );
  const filtersDirty = useMemo(() => {
    try {
      return (
        transactionsFiltersCacheKey(draftToFilters(filterDraft)) !==
        transactionsFiltersCacheKey(filters)
      );
    } catch {
      // Invalid draft (e.g. min > max): treat as dirty so Apply stays
      // enabled and surfaces the validation error on submit.
      return true;
    }
  }, [filterDraft, filters]);

  const clearPageCache = useCallback(() => {
    pageCacheRef.current.clear();
    preloadInFlightRef.current.clear();
  }, []);

  const rememberPage = useCallback(
    (query: TransactionsPageQuery, response: EventsResponse) => {
      pageCacheRef.current.set(transactionsPageCacheKey(query), response);
    },
    [],
  );

  const applyResponse = useCallback((response: EventsResponse) => {
    applyEventsResponse(response, {
      setEvents,
      setPage,
      setTotalPages,
      setTotalCount,
      setPageSize,
    });
  }, []);

  const loadEventsPage = useCallback(
    async (
      query: TransactionsPageQuery,
      options?: { showPageLoading?: boolean; useCache?: boolean },
    ) => {
      const cacheKey = transactionsPageCacheKey(query);

      if (options?.useCache !== false) {
        const cached = pageCacheRef.current.get(cacheKey);
        if (cached) {
          applyResponse(cached);
          return cached;
        }
      }

      if (options?.showPageLoading) {
        setPageLoading(true);
      }

      try {
        const response = await fetchTransactionsPage(query);
        rememberPage(query, response);
        applyResponse(response);
        return response;
      } finally {
        if (options?.showPageLoading) {
          setPageLoading(false);
        }
      }
    },
    [applyResponse, rememberPage],
  );

  const preloadPages = useCallback(
    async (query: TransactionsPageQuery, response: EventsResponse) => {
      const targets = getAdjacentPages(query.page, response.totalPages).filter(
        (targetPage) => targetPage !== query.page,
      );

      await Promise.all(
        targets.map(async (targetPage) => {
          const preloadQuery: TransactionsPageQuery = {
            page: targetPage,
            pageSize: query.pageSize,
            filters: query.filters,
          };
          const cacheKey = transactionsPageCacheKey(preloadQuery);

          if (
            pageCacheRef.current.has(cacheKey) ||
            preloadInFlightRef.current.has(cacheKey)
          ) {
            return;
          }

          preloadInFlightRef.current.add(cacheKey);

          try {
            const preloaded = await fetchTransactionsPage(preloadQuery);
            rememberPage(preloadQuery, preloaded);
          } catch {
            // Preloading is best-effort; ignore failures.
          } finally {
            preloadInFlightRef.current.delete(cacheKey);
          }
        }),
      );
    },
    [rememberPage],
  );

  const refresh = useCallback(
    async (next: TransactionsPageQuery, options?: { fullScreen?: boolean }) => {
      if (options?.fullScreen) {
        setLoading(true);
      } else {
        setPageLoading(true);
      }

      // When bootstrap redirects on a full-screen load, keep the skeleton up
      // until navigation lands instead of flashing the empty page.
      let redirected = false;
      try {
        const ready = await checkBootstrapOrRedirect(router);
        if (!ready) {
          redirected = true;
          return;
        }

        const [walletsRes, fundsRes, eventsRes] = await Promise.all([
          apiJson<{ wallets: Wallet[] }>("/api/wallets?summary=false"),
          apiJson<{ funds: Fund[] }>("/api/funds?summary=false"),
          fetchTransactionsPage(next),
        ]);

        setWallets(walletsRes.wallets);
        setFunds(fundsRes.funds);
        rememberPage(next, eventsRes);
        applyResponse(eventsRes);
        void preloadPages(next, eventsRes);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (options?.fullScreen) {
          if (!redirected) setLoading(false);
        } else {
          setPageLoading(false);
        }
      }
    },
    [applyResponse, preloadPages, rememberPage, router],
  );

  const goToPage = useCallback(
    async (targetPage: number) => {
      if (targetPage < 0 || (totalPages > 0 && targetPage >= totalPages)) {
        return;
      }

      const query: TransactionsPageQuery = {
        page: targetPage,
        pageSize,
        filters,
      };

      const cached = pageCacheRef.current.get(transactionsPageCacheKey(query));
      if (cached) {
        applyResponse(cached);
        void preloadPages(query, cached);
        return;
      }

      try {
        const response = await loadEventsPage(query, { showPageLoading: true });
        if (response) {
          void preloadPages(query, response);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load page");
      }
    },
    [
      applyResponse,
      filters,
      loadEventsPage,
      pageSize,
      preloadPages,
      totalPages,
    ],
  );

  const handlePageSizeChange = useCallback(
    (value: string) => {
      const nextPageSize = Number(value) as TransactionsPageSize;
      clearPageCache();
      void refresh(
        { page: 0, pageSize: nextPageSize, filters },
        { fullScreen: false },
      );
    },
    [clearPageCache, filters, refresh],
  );

  const applyFilters = useCallback(async () => {
    try {
      const nextFilters = draftToFilters(filterDraft);
      setFilters(nextFilters);
      clearPageCache();
      await refresh(
        { page: 0, pageSize, filters: nextFilters },
        { fullScreen: false },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid filters");
    }
  }, [clearPageCache, filterDraft, pageSize, refresh]);

  const resetFilters = useCallback(async () => {
    setFilters(DEFAULT_TRANSACTIONS_FILTERS);
    setFilterDraft(DEFAULT_FILTER_DRAFT);
    clearPageCache();
    await refresh(
      { page: 0, pageSize, filters: DEFAULT_TRANSACTIONS_FILTERS },
      { fullScreen: false },
    );
  }, [clearPageCache, pageSize, refresh]);

  const handleFiltersSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void applyFilters();
    },
    [applyFilters],
  );

  const handleRefresh = useCallback(() => {
    clearPageCache();
    void refresh({ page, pageSize, filters }, { fullScreen: false });
  }, [clearPageCache, filters, page, pageSize, refresh]);

  const handleSaved = useCallback(async () => {
    clearPageCache();
    await refresh({ page, pageSize, filters }, { fullScreen: false });
  }, [clearPageCache, filters, page, pageSize, refresh]);

  // Scoped to the filters currently applied, because the button sits right
  // beside the filtered count and reads as if it were. The whole-ledger version
  // lives on the Overview, where a ledger-wide action belongs.
  const clearFilteredPending = useCallback(async () => {
    const noun = totalCount === 1 ? "transaction" : "transactions";
    const ok = await confirm({
      title: `Clear ${totalCount.toLocaleString()} pending ${noun}?`,
      description: `Pending transactions are ones you've recorded but marked as not-yet-settled. This settles the ${totalCount.toLocaleString()} ${noun} matching your current filters, folding them into your real balance right away. Anything outside the filters is left pending.`,
      confirmLabel: `Clear ${totalCount.toLocaleString()} pending`,
    });
    if (!ok) return;

    try {
      const params = new URLSearchParams();
      appendTransactionFilterParams(
        params,
        normalizeTransactionsFilters(filters),
      );
      const { cleared } = await apiJson<{ cleared: number }>(
        `/api/transactions/clear-pending?${params.toString()}`,
        { method: "POST" },
      );

      const nextFilters = normalizeTransactionsFilters({
        ...filters,
        pendingStatus: "all",
      });
      setFilters(nextFilters);
      setFilterDraft(filtersToDraft(nextFilters));
      clearPageCache();
      await refresh(
        { page: 0, pageSize, filters: nextFilters },
        { fullScreen: false },
      );
      toast.success(
        `Cleared ${cleared.toLocaleString()} pending ${
          cleared === 1 ? "transaction" : "transactions"
        }`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear pending");
    }
  }, [confirm, clearPageCache, filters, pageSize, refresh, totalCount]);

  useEffect(() => {
    router.prefetch("/tracker");
    router.prefetch("/tracker/funds");
    router.prefetch("/tracker/wallets");
  }, [router]);

  useEffect(() => {
    void refresh(
      {
        page: 0,
        pageSize: DEFAULT_PAGE_SIZE,
        filters: DEFAULT_TRANSACTIONS_FILTERS,
      },
      { fullScreen: true },
    );
    // Mount-only initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchFilterDraft = useCallback(
    (patch: Partial<TransactionsFilterDraft>) => {
      setFilterDraft((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  if (loading) {
    return <TransactionsSkeleton />;
  }

  const paginationProps = {
    page,
    totalPages,
    disabled: pageLoading,
    onPageChange: (targetPage: number) => void goToPage(targetPage),
  };
  const activeFilterLabel =
    activeFilterCount === 0
      ? "No filters applied"
      : `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`;
  const showPagination = totalPages > 1;

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      <AddTransactionFab onClick={() => setCreateTransactionOpen(true)} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <TrackerActions
          onRefresh={() => void handleRefresh()}
          refreshing={pageLoading}
          onAddTransaction={() => setCreateTransactionOpen(true)}
          onAddIncome={() => setCreateIncomeOpen(true)}
          disabled={pageLoading}
        />
      </div>

      <EventModals
        wallets={wallets}
        funds={funds}
        createTransactionOpen={createTransactionOpen}
        onCreateTransactionOpenChange={setCreateTransactionOpen}
        createIncomeOpen={createIncomeOpen}
        onCreateIncomeOpenChange={setCreateIncomeOpen}
        detailsEvent={detailsEvent}
        onDetailsEventChange={setDetailsEvent}
        onSaved={handleSaved}
      />

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <CardDescription className="min-w-0">
              {totalCount === 0
                ? activeFilterCount > 0
                  ? "No transactions match your filters"
                  : "No transactions yet"
                : `${totalCount.toLocaleString()} ${
                    totalCount === 1 ? "transaction" : "transactions"
                  }`}
            </CardDescription>
            {filters.pendingStatus === "pending" && totalCount > 0 ? (
              <Button
                type="button"
                onClick={() => void clearFilteredPending()}
                disabled={pageLoading}
              >
                <CheckCircle2Icon />
                Clear {totalCount.toLocaleString()} pending
              </Button>
            ) : null}
          </div>

          <CardAction>
            <div className="flex items-center gap-2">
              <Label htmlFor={pageSizeId}>Per page</Label>
              <Select
                value={String(pageSize)}
                onValueChange={handlePageSizeChange}
                disabled={pageLoading}
              >
                <SelectTrigger id={pageSizeId} size="sm" className="min-w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {TRANSACTIONS_PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleFiltersSubmit}
            className="mb-4 rounded-md border"
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={filtersExpanded}
                aria-controls="transactions-filters-panel"
                onClick={() => setFiltersExpanded((expanded) => !expanded)}
                className="-ml-1.5 gap-1.5"
              >
                <ListFilterIcon />
                Filters
                {activeFilterCount > 0 && (
                  <span className="text-2xs bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full font-semibold tabular-nums">
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
              {!filtersExpanded && (
                <span className="text-muted-foreground truncate text-xs">
                  {activeFilterLabel}
                </span>
              )}
            </div>

            <div
              id="transactions-filters-panel"
              inert={!filtersExpanded}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-in-out",
                filtersExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-3 p-3 pt-2">
                  <FilterSearchField
                    id={searchId}
                    value={filterDraft.search}
                    onChange={(search) => patchFilterDraft({ search })}
                  />

                  <div className="grid gap-3 sm:grid-cols-3">
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

                  <div className="border-border flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="submit"
                        disabled={pageLoading || !filtersDirty}
                      >
                        <SearchIcon />
                        {filtersDirty ? "Apply" : "Applied"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void resetFilters()}
                        disabled={
                          pageLoading ||
                          (activeFilterCount === 0 && !filtersDirty)
                        }
                      >
                        <XIcon />
                        Reset
                      </Button>
                      <span className="text-muted-foreground text-xs">
                        {activeFilterLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {showPagination && <TransactionsPagination {...paginationProps} />}

          <div
            className={cn(
              "flex flex-col gap-1.5",
              showPagination ? "mt-4" : "",
              pageLoading && "pointer-events-none opacity-60",
            )}
          >
            {events.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm">
                  {activeFilterCount > 0
                    ? "No transactions match your filters."
                    : "No transactions yet."}
                </p>
                {activeFilterCount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void resetFilters()}
                    disabled={pageLoading}
                  >
                    <XIcon />
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              events.map((ev) => (
                <TransactionEventCard
                  key={ev.id}
                  event={ev}
                  onClick={() => setDetailsEvent(ev)}
                />
              ))
            )}
          </div>

          {showPagination && (
            <div className="mt-4">
              <TransactionsPagination {...paginationProps} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
