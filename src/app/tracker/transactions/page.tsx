"use client";

import dynamic from "next/dynamic";
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
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  CheckIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  ListFilterIcon,
  PlusIcon,
  RefreshCwIcon,
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

import { TransactionsPagination } from "@/app/tracker/components/transactions-pagination";
import { TransactionEventCard } from "@/app/tracker/components/transaction-event-card";
import { apiJson } from "@/app/tracker/lib/api";
import { isIncomeLike } from "@/app/tracker/lib/events";
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  fetchTransactionsPage,
  getAdjacentPages,
  normalizeTransactionsFilters,
  transactionsFiltersCacheKey,
  transactionsPageCacheKey,
  type TransactionDirectionFilter,
  type TransactionIncomeFilter,
  type TransactionPendingFilter,
  type TransactionsPageFilters,
  type TransactionsPageQuery,
} from "@/app/tracker/lib/transactions-page-cache";
import { fmtAmount } from "@/app/tracker/lib/format";
import type {
  BootstrapResponse,
  EventsResponse,
  Fund,
  TransactionEvent,
  TransactionsPageSize,
  Wallet,
} from "@/app/tracker/types";
import { TRANSACTIONS_PAGE_SIZE_OPTIONS } from "@/app/tracker/types";

const TransactionModal = dynamic(
  () =>
    import("@/app/tracker/components/transaction-modal").then(
      (m) => m.TransactionModal,
    ),
  { ssr: false },
);

const IncomeModal = dynamic(
  () =>
    import("@/app/tracker/components/income-modal").then((m) => m.IncomeModal),
  { ssr: false },
);

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

function formatFilterAmount(value: number | null) {
  return value === null ? "" : String(value);
}

function filtersToDraft(
  filters: TransactionsPageFilters,
): TransactionsFilterDraft {
  return {
    ...filters,
    minAmount: formatFilterAmount(filters.minAmount),
    maxAmount: formatFilterAmount(filters.maxAmount),
  };
}

function parseFilterAmount(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} amount must be zero or greater`);
  }

  return parsed;
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

function toggleSelectedId(ids: number[], id: number) {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

function countActiveFilters(filters: TransactionsPageFilters) {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.fundIds.length > 0) count += 1;
  if (filters.walletIds.length > 0) count += 1;
  if (filters.minAmount !== null || filters.maxAmount !== null) count += 1;
  if (filters.pendingStatus !== "all") count += 1;
  if (filters.income !== "all") count += 1;
  if (filters.direction !== "all") count += 1;
  return count;
}

type MultiSelectOption = {
  id: number;
  name: string;
};

const AMOUNT_SLIDER_UI_MAX = 5_000;

function amountSliderScaleMax(parsedMin: number | null, parsedMax: number | null) {
  const highest = Math.max(parsedMin ?? 0, parsedMax ?? 0);
  if (highest <= AMOUNT_SLIDER_UI_MAX) {
    return AMOUNT_SLIDER_UI_MAX;
  }

  return amountSliderCeiling(highest);
}

function amountSliderCeiling(maxAmount: number) {
  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    return 100;
  }

  if (maxAmount <= 100) return 100;
  if (maxAmount <= 500) return Math.ceil(maxAmount / 25) * 25;
  if (maxAmount <= 1000) return Math.ceil(maxAmount / 50) * 50;
  if (maxAmount <= 5000) return Math.ceil(maxAmount / 250) * 250;
  if (maxAmount <= 10000) return Math.ceil(maxAmount / 500) * 500;
  return Math.ceil(maxAmount / 1000) * 1000;
}

function amountSliderStep(maxAmount: number) {
  if (maxAmount <= 500) return 5;
  if (maxAmount <= 5000) return 25;
  return 100;
}

function parseDraftAmountValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDraftAmount(value: number, zeroIsEmpty = false) {
  if (zeroIsEmpty && value <= 0) {
    return "";
  }
  return String(value);
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

const RANGE_INPUT_CLASS =
  "pointer-events-none absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-sm [&::-moz-range-track]:h-1 [&::-moz-range-track]:border-none [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:mt-1.5 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm";

function AmountRangeSlider(args: {
  minId: string;
  maxId: string;
  minAmount: string;
  maxAmount: string;
  onChange: (
    patch: Pick<TransactionsFilterDraft, "minAmount" | "maxAmount">,
  ) => void;
}) {
  const { minId, maxId, minAmount, maxAmount, onChange } = args;
  const parsedMin = parseDraftAmountValue(minAmount);
  const parsedMax = parseDraftAmountValue(maxAmount);
  const sliderMax = amountSliderScaleMax(parsedMin, parsedMax);
  const step = amountSliderStep(sliderMax);
  const minValue = Math.min(Math.max(parsedMin ?? 0, 0), sliderMax);
  const maxIsOpen = !maxAmount;
  const maxValue = maxIsOpen
    ? sliderMax
    : Math.min(Math.max(parsedMax ?? sliderMax, minValue), sliderMax);
  const minPercent = (minValue / sliderMax) * 100;
  const maxPercent = (maxValue / sliderMax) * 100;
  const minLabel = minAmount ? fmtAmount(minValue) : fmtAmount(0);
  const maxLabel = maxIsOpen ? `${fmtAmount(sliderMax)}+` : fmtAmount(maxValue);
  const minThumbOnTop = minValue > sliderMax * 0.5;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 xl:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Amount</Label>
        <div className="text-muted-foreground text-xs tabular-nums">
          {minLabel} - {maxLabel}
        </div>
      </div>

      <div className="relative h-8 px-1">
        <div className="bg-muted absolute top-1/2 right-1 left-1 h-1 -translate-y-1/2 rounded-full" />
        <div
          className="bg-primary absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{
            left: `calc(${minPercent}% + 0.25rem)`,
            right: `calc(${100 - maxPercent}% + 0.25rem)`,
          }}
        />
        <input
          id={minId}
          aria-label="Minimum amount"
          type="range"
          min={0}
          max={sliderMax}
          step={step}
          value={minValue}
          onChange={(event) => {
            const nextMin = Math.min(Number(event.target.value), maxValue);
            onChange({
              minAmount: toDraftAmount(nextMin, true),
              maxAmount,
            });
          }}
          style={{ zIndex: minThumbOnTop ? 3 : 2 }}
          className={RANGE_INPUT_CLASS}
        />
        <input
          id={maxId}
          aria-label="Maximum amount"
          type="range"
          min={0}
          max={sliderMax}
          step={step}
          value={maxValue}
          onChange={(event) => {
            const nextMax = Math.max(Number(event.target.value), minValue);
            onChange({
              minAmount,
              maxAmount:
                nextMax >= sliderMax ? "" : toDraftAmount(nextMax),
            });
          }}
          style={{ zIndex: minThumbOnTop ? 2 : 3 }}
          className={RANGE_INPUT_CLASS}
        />
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-[11px] tabular-nums">
        <span>{fmtAmount(0)}</span>
        <span>{fmtAmount(sliderMax)}+</span>
      </div>
    </div>
  );
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
  const pageSizeId = useId();
  const searchId = useId();
  const minAmountId = useId();
  const maxAmountId = useId();
  const pendingStatusId = useId();
  const incomeFilterId = useId();
  const directionFilterId = useId();

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

  const detailsIsIncome = detailsEvent ? isIncomeLike(detailsEvent) : false;
  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
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
          setLoading(false);
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

  const clearAllPending = useCallback(async () => {
    const ok = window.confirm(
      "Mark ALL transactions as no longer pending? This will affect totals immediately.",
    );
    if (!ok) return;

    try {
      await apiJson("/api/transactions/clear-pending", { method: "POST" });
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
      toast.success("All pending transactions cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear pending");
    }
  }, [clearPageCache, filters, pageSize, refresh]);

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
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading…</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Loading transactions.
        </CardContent>
      </Card>
    );
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={pageLoading}
          >
            <RefreshCwIcon className={cn(pageLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setCreateTransactionOpen(true)}>
            <PlusIcon />
            Add transaction
          </Button>
          <Button variant="outline" onClick={() => setCreateIncomeOpen(true)}>
            <CircleDollarSignIcon />
            Add income
          </Button>
        </div>
      </div>

      <TransactionModal
        open={createTransactionOpen}
        onOpenChange={setCreateTransactionOpen}
        wallets={wallets}
        funds={funds}
        onSaved={async () => {
          toast.success("Transaction saved");
          await handleSaved();
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={setCreateIncomeOpen}
        wallets={wallets}
        onSaved={async () => {
          toast.success("Income saved");
          await handleSaved();
        }}
      />

      <TransactionModal
        open={Boolean(detailsEvent) && !detailsIsIncome}
        onOpenChange={(open: boolean) => {
          if (!open) setDetailsEvent(null);
        }}
        wallets={wallets}
        funds={funds}
        initialEvent={detailsEvent}
        onSaved={async () => {
          toast.success("Transaction updated");
          await handleSaved();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          toast.success("Transaction deleted");
          await handleSaved();
          setDetailsEvent(null);
        }}
      />

      <IncomeModal
        open={Boolean(detailsEvent) && detailsIsIncome}
        onOpenChange={(open: boolean) => {
          if (!open) setDetailsEvent(null);
        }}
        wallets={wallets}
        initialEvent={detailsEvent}
        onSaved={async () => {
          toast.success("Income updated");
          await handleSaved();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          toast.success("Income deleted");
          await handleSaved();
          setDetailsEvent(null);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {totalCount === 0
              ? activeFilterCount > 0
                ? "No matching transactions"
                : "No transactions yet"
              : `${totalCount.toLocaleString()} ${
                  totalCount === 1 ? "transaction" : "transactions"
                }${activeFilterCount > 0 ? " match your filters" : ""}`}
          </CardDescription>
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
              {!filtersExpanded && (
                <span className="text-muted-foreground truncate text-xs">
                  {activeFilterLabel}
                </span>
              )}
            </div>

            <div
              id="transactions-filters-panel"
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-in-out",
                filtersExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-3 p-3 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
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

                    <AmountRangeSlider
                      minId={minAmountId}
                      maxId={maxAmountId}
                      minAmount={filterDraft.minAmount}
                      maxAmount={filterDraft.maxAmount}
                      onChange={patchFilterDraft}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <MultiSelectDropdown
                      label="Funds"
                      allLabel="All funds"
                      options={funds}
                      selectedIds={filterDraft.fundIds}
                      onChange={(fundIds) => patchFilterDraft({ fundIds })}
                    />

                    <MultiSelectDropdown
                      label="Wallets"
                      allLabel="All wallets"
                      options={wallets}
                      selectedIds={filterDraft.walletIds}
                      onChange={(walletIds) => patchFilterDraft({ walletIds })}
                    />
                  </div>

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
                          pageLoading || (activeFilterCount === 0 && !filtersDirty)
                        }
                      >
                        <XIcon />
                        Reset
                      </Button>
                      <span className="text-muted-foreground text-xs">
                        {activeFilterLabel}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void clearAllPending()}
                      disabled={pageLoading}
                      className="sm:ml-auto"
                    >
                      <CheckCircle2Icon />
                      Clear pending
                    </Button>
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
