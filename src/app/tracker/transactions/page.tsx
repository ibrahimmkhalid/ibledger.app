"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
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
import { Switch } from "@/components/ui/switch";

import { TransactionsPagination } from "@/app/tracker/components/transactions-pagination";
import { TransactionEventCard } from "@/app/tracker/components/transaction-event-card";
import { apiJson } from "@/app/tracker/lib/api";
import { isIncomeLike } from "@/app/tracker/lib/events";
import {
  fetchTransactionsPage,
  getAdjacentPages,
  transactionsPageCacheKey,
  type TransactionsPageQuery,
} from "@/app/tracker/lib/transactions-page-cache";
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

function applyEventsResponse(
  response: EventsResponse,
  setters: {
    setEvents: (events: TransactionEvent[]) => void;
    setPage: (page: number) => void;
    setTotalPages: (totalPages: number) => void;
    setPageSize: (pageSize: TransactionsPageSize) => void;
  },
) {
  setters.setEvents(response.events);
  setters.setPage(response.currentPage);
  setters.setTotalPages(response.totalPages);
  setters.setPageSize(response.pageSize as TransactionsPageSize);
}

export default function TransactionsPage() {
  const router = useRouter();
  const pageSizeId = useId();
  const pendingOnlyId = useId();

  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pendingOnly, setPendingOnly] = useState(false);
  const [pageSize, setPageSize] =
    useState<TransactionsPageSize>(DEFAULT_PAGE_SIZE);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const [createTransactionOpen, setCreateTransactionOpen] = useState(false);
  const [createIncomeOpen, setCreateIncomeOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<TransactionEvent | null>(
    null,
  );

  const pageCacheRef = useRef(new Map<string, EventsResponse>());
  const preloadInFlightRef = useRef(new Set<string>());

  const detailsIsIncome = detailsEvent ? isIncomeLike(detailsEvent) : false;

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
            pendingOnly: query.pendingOnly,
            pageSize: query.pageSize,
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
      setError(null);
      setNotice(null);

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
          apiJson<{ wallets: Wallet[] }>("/api/wallets"),
          apiJson<{ funds: Fund[] }>("/api/funds"),
          fetchTransactionsPage(next),
        ]);

        setWallets(walletsRes.wallets);
        setFunds(fundsRes.funds);
        rememberPage(next, eventsRes);
        applyResponse(eventsRes);
        void preloadPages(next, eventsRes);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
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
        pendingOnly,
        pageSize,
      };

      setError(null);

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
        setError(e instanceof Error ? e.message : "Failed to load page");
      }
    },
    [
      applyResponse,
      loadEventsPage,
      pageSize,
      pendingOnly,
      preloadPages,
      totalPages,
    ],
  );

  const handlePageSizeChange = useCallback(
    (value: string) => {
      const nextPageSize = Number(value) as TransactionsPageSize;
      clearPageCache();
      void refresh(
        { page: 0, pendingOnly, pageSize: nextPageSize },
        { fullScreen: false },
      );
    },
    [clearPageCache, pendingOnly, refresh],
  );

  const handlePendingOnlyChange = useCallback(
    (checked: boolean) => {
      setPendingOnly(checked);
      clearPageCache();
      void refresh(
        { page: 0, pendingOnly: checked, pageSize },
        { fullScreen: false },
      );
    },
    [clearPageCache, pageSize, refresh],
  );

  const handleRefresh = useCallback(() => {
    clearPageCache();
    void refresh({ page, pendingOnly, pageSize }, { fullScreen: false });
  }, [clearPageCache, page, pageSize, pendingOnly, refresh]);

  const handleSaved = useCallback(async () => {
    clearPageCache();
    await refresh({ page, pendingOnly, pageSize }, { fullScreen: false });
  }, [clearPageCache, page, pageSize, pendingOnly, refresh]);

  const clearAllPending = useCallback(async () => {
    const ok = window.confirm(
      "Mark ALL transactions as no longer pending? This will affect totals immediately.",
    );
    if (!ok) return;

    try {
      await apiJson("/api/transactions/clear-pending", { method: "POST" });
      setNotice("All pending transactions cleared");
      clearPageCache();
      await refresh(
        { page: 0, pendingOnly: false, pageSize },
        { fullScreen: false },
      );
      setPendingOnly(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear pending");
    }
  }, [clearPageCache, pageSize, refresh]);

  useEffect(() => {
    router.prefetch("/tracker");
    router.prefetch("/tracker/funds");
    router.prefetch("/tracker/wallets");
  }, [router]);

  useEffect(() => {
    void refresh(
      { page: 0, pendingOnly: false, pageSize: DEFAULT_PAGE_SIZE },
      { fullScreen: true },
    );
    // Mount-only initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void handleRefresh()}>
            Refresh
          </Button>
          <Button onClick={() => setCreateTransactionOpen(true)}>
            Add transaction
          </Button>
          <Button variant="outline" onClick={() => setCreateIncomeOpen(true)}>
            Add income
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{error}</CardContent>
        </Card>
      )}

      {notice && (
        <Card>
          <CardHeader>
            <CardTitle>OK</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{notice}</CardContent>
        </Card>
      )}

      <TransactionModal
        open={createTransactionOpen}
        onOpenChange={setCreateTransactionOpen}
        wallets={wallets}
        funds={funds}
        onSaved={async () => {
          setNotice("Transaction saved");
          await handleSaved();
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={setCreateIncomeOpen}
        wallets={wallets}
        onSaved={async () => {
          setNotice("Income saved");
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
          setNotice("Transaction updated");
          await handleSaved();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Transaction deleted");
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
          setNotice("Income updated");
          await handleSaved();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Income deleted");
          await handleSaved();
          setDetailsEvent(null);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {pendingOnly ? "Pending transactions" : "All transactions"}
          </CardTitle>
          <CardAction>
            <div className="flex flex-wrap items-center gap-3">
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

              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={pendingOnlyId}>Pending only</Label>
                <Switch
                  id={pendingOnlyId}
                  size="sm"
                  checked={pendingOnly}
                  onCheckedChange={handlePendingOnlyChange}
                  disabled={pageLoading}
                />

                {pendingOnly && (
                  <Button
                    variant="outline"
                    onClick={() => void clearAllPending()}
                    disabled={pageLoading}
                  >
                    Mark all cleared
                  </Button>
                )}
              </div>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <TransactionsPagination {...paginationProps} />

          <div
            className={
              pageLoading
                ? "pointer-events-none mt-4 flex flex-col gap-1.5 opacity-60"
                : "mt-4 flex flex-col gap-1.5"
            }
          >
            {events.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No transactions found.
              </p>
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

          <div className="mt-4">
            <TransactionsPagination {...paginationProps} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
