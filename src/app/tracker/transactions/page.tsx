"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { IncomeModal } from "@/app/tracker/components/income-modal";
import { TransactionEventCard } from "@/app/tracker/components/transaction-event-card";
import { TransactionModal } from "@/app/tracker/components/transaction-modal";
import { apiJson } from "@/app/tracker/lib/api";
import { isIncomeLike } from "@/app/tracker/lib/events";
import type {
  EventsResponse,
  Fund,
  TransactionEvent,
  Wallet,
} from "@/app/tracker/types";

export default function TransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingOnlyId = useId();
  const [pendingOnly, setPendingOnly] = useState(false);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [page, setPage] = useState(0);
  const [nextPage, setNextPage] = useState(-1);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const visibleEvents = useMemo(() => events, [events]);

  const [createTransactionOpen, setCreateTransactionOpen] = useState(false);
  const [createIncomeOpen, setCreateIncomeOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<TransactionEvent | null>(
    null,
  );

  const detailsIsIncome = detailsEvent ? isIncomeLike(detailsEvent) : false;

  const displayFunds = useMemo(() => funds, [funds]);

  const refresh = useCallback(
    async (next: { page: number; pendingOnly: boolean }) => {
      setLoading(true);
      setError(null);
      setNotice(null);

      try {
        await apiJson("/api/bootstrap", { method: "POST", body: "{}" });

        const [walletsRes, fundsRes, eventsRes] = await Promise.all([
          apiJson<{ wallets: Wallet[] }>("/api/wallets"),
          apiJson<{ funds: Fund[] }>("/api/funds"),
          apiJson<EventsResponse>(
            `/api/transactions?page=${next.page}${
              next.pendingOnly ? "&pendingOnly=true" : ""
            }`,
          ),
        ]);

        setWallets(walletsRes.wallets);
        setFunds(fundsRes.funds);
        setEvents(eventsRes.events);
        setNextPage(eventsRes.nextPage);
        setPage(eventsRes.currentPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clearAllPending = useCallback(async () => {
    const ok = window.confirm(
      "Mark ALL transactions as no longer pending? This will affect totals immediately.",
    );
    if (!ok) return;

    try {
      await apiJson("/api/transactions/clear-pending", { method: "POST" });
      setNotice("All pending transactions cleared");
      setPendingOnly(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear pending");
    }
  }, [setNotice, setError, setPendingOnly]);

  useEffect(() => {
    void refresh({ page: 0, pendingOnly });
  }, [refresh, pendingOnly]);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void refresh({ page, pendingOnly })}
          >
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
        funds={displayFunds}
        onSaved={async () => {
          setNotice("Transaction saved");
          await refresh({ page, pendingOnly });
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={setCreateIncomeOpen}
        wallets={wallets}
        onSaved={async () => {
          setNotice("Income saved");
          await refresh({ page, pendingOnly });
        }}
      />

      <TransactionModal
        open={Boolean(detailsEvent) && !detailsIsIncome}
        onOpenChange={(open: boolean) => {
          if (!open) setDetailsEvent(null);
        }}
        wallets={wallets}
        funds={displayFunds}
        initialEvent={detailsEvent}
        onSaved={async () => {
          setNotice("Transaction updated");
          await refresh({ page, pendingOnly });
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Transaction deleted");
          await refresh({ page, pendingOnly });
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
          await refresh({ page, pendingOnly });
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Income deleted");
          await refresh({ page, pendingOnly });
          setDetailsEvent(null);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {pendingOnly ? "Pending transactions" : "All transactions"}
          </CardTitle>
          <CardAction>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={pendingOnlyId}>Pending only</Label>
              <Switch
                id={pendingOnlyId}
                size="sm"
                checked={pendingOnly}
                onCheckedChange={setPendingOnly}
              />

              {pendingOnly && (
                <Button
                  variant="outline"
                  onClick={() => void clearAllPending()}
                >
                  Mark all cleared
                </Button>
              )}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            {visibleEvents.map((ev) => (
              <TransactionEventCard
                key={ev.id}
                event={ev}
                onClick={() => setDetailsEvent(ev)}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page <= 0}
              onClick={() =>
                void refresh({
                  page: Math.max(0, page - 1),
                  pendingOnly,
                })
              }
            >
              Previous
            </Button>
            <div className="text-muted-foreground text-sm">Page {page + 1}</div>
            <Button
              variant="outline"
              disabled={nextPage === -1}
              onClick={() => void refresh({ page: nextPage, pendingOnly })}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
