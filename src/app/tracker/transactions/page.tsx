"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { IncomeModal } from "@/app/tracker/components/income-modal";
import { TransactionModal } from "@/app/tracker/components/transaction-modal";
import { apiJson } from "@/app/tracker/lib/api";
import { fmtAmount, fmtDateShort } from "@/app/tracker/lib/format";
import {
  computeEventDisplayAmount,
  computeEventFundName,
  computeEventWalletName,
  isIncomeLike,
} from "@/app/tracker/lib/events";
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

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [page, setPage] = useState(0);
  const [nextPage, setNextPage] = useState(-1);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const [createTransactionOpen, setCreateTransactionOpen] = useState(false);
  const [createIncomeOpen, setCreateIncomeOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<TransactionEvent | null>(
    null,
  );

  const detailsIsIncome = detailsEvent ? isIncomeLike(detailsEvent) : false;

  const displayFunds = useMemo(
    () => funds.filter((f) => f.kind !== "income"),
    [funds],
  );

  const refresh = useCallback(async (next: { page: number }) => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await apiJson("/api/bootstrap", { method: "POST", body: "{}" });

      const [walletsRes, fundsRes, eventsRes] = await Promise.all([
        apiJson<{ wallets: Wallet[] }>("/api/wallets"),
        apiJson<{ funds: Fund[] }>("/api/funds"),
        apiJson<EventsResponse>(`/api/transactions?page=${next.page}`),
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
  }, []);

  useEffect(() => {
    void refresh({ page: 0 });
  }, [refresh]);

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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh({ page })}>
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
          await refresh({ page });
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={setCreateIncomeOpen}
        wallets={wallets}
        onSaved={async () => {
          setNotice("Income saved");
          await refresh({ page });
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
          await refresh({ page });
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Transaction deleted");
          await refresh({ page });
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
          await refresh({ page });
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Income deleted");
          await refresh({ page });
          setDetailsEvent(null);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>All transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[140px] text-right">Amount</TableHead>
                <TableHead className="w-[140px]">Wallet</TableHead>
                <TableHead className="w-[140px]">Fund</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => {
                const net = computeEventDisplayAmount(ev);
                const walletName = computeEventWalletName(ev);
                const fundName = computeEventFundName(ev);
                const rowClassName = ev.isPending ? "italic" : "";

                return (
                  <TableRow key={ev.id} className={rowClassName}>
                    <TableCell>{fmtDateShort(ev.occurredAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {ev.description ?? "(no description)"}
                        </span>
                        {!ev.isPosting && (
                          <span className="text-muted-foreground text-xs">
                            Parent
                          </span>
                        )}
                        {isIncomeLike(ev) && (
                          <span className="text-muted-foreground text-xs">
                            Income
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={net < 0 ? "text-destructive" : ""}>
                        {fmtAmount(net)}
                      </span>
                    </TableCell>
                    <TableCell>{walletName ?? ""}</TableCell>
                    <TableCell>{fundName ?? ""}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => setDetailsEvent(ev)}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page <= 0}
              onClick={() => void refresh({ page: Math.max(0, page - 1) })}
            >
              Previous
            </Button>
            <div className="text-muted-foreground text-sm">Page {page + 1}</div>
            <Button
              variant="outline"
              disabled={nextPage === -1}
              onClick={() => void refresh({ page: nextPage })}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
