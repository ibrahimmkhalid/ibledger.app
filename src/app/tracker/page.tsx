"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

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
  TotalsResponse,
  TransactionEvent,
  Wallet,
} from "@/app/tracker/types";

function renderClearedWithPending(cleared: number, withPending: number) {
  const c = Number(cleared);
  const p = Number(withPending);
  const delta = p - c;

  const sign = delta > 0 ? "+" : "-";
  return (
    <>
      <span className="font-semibold">{fmtAmount(c)}</span>
      {delta !== 0 && (
        <span className="text-muted-foreground ml-2">
          [{sign}${fmtAmount(delta, "plain")}]
        </span>
      )}
    </>
  );
}

export default function TrackerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recentPendingOnlyId = useId();
  const [recentPendingOnly, setRecentPendingOnly] = useState(false);

  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const visibleEvents = useMemo(() => {
    if (!recentPendingOnly) return events;
    return events.filter((ev) => ev.isPending);
  }, [events, recentPendingOnly]);

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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await apiJson("/api/bootstrap", { method: "POST", body: "{}" });

      const [walletsRes, fundsRes, totalsRes, eventsRes] = await Promise.all([
        apiJson<{ wallets: Wallet[] }>("/api/wallets"),
        apiJson<{ funds: Fund[] }>("/api/funds"),
        apiJson<TotalsResponse>("/api/totals"),
        apiJson<EventsResponse>("/api/transactions?page=0"),
      ]);

      setWallets(walletsRes.wallets);
      setFunds(fundsRes.funds);
      setTotals(totalsRes);
      setEvents(eventsRes.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading…</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Loading wallets, funds, totals, and recent events.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
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
          await refresh();
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={setCreateIncomeOpen}
        wallets={wallets}
        onSaved={async () => {
          setNotice("Income saved");
          await refresh();
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
          await refresh();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Transaction deleted");
          await refresh();
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
          await refresh();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          setNotice("Income deleted");
          await refresh();
          setDetailsEvent(null);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Grand Total</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {totals ? (
            <div className="text-lg">
              {renderClearedWithPending(
                totals.grandTotal,
                totals.grandTotalWithPending,
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wallets</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>{w.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {renderClearedWithPending(
                        w.balance,
                        w.balanceWithPending,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funds</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayFunds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {renderClearedWithPending(
                        f.balance,
                        f.balanceWithPending,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {recentPendingOnly
              ? "Recent Pending Transactions"
              : "Recent Transactions"}
          </CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <Label htmlFor={recentPendingOnlyId}>Pending only</Label>
              <Switch
                id={recentPendingOnlyId}
                size="sm"
                checked={recentPendingOnly}
                onCheckedChange={setRecentPendingOnly}
              />
            </div>
          </CardAction>
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
              {visibleEvents.map((ev) => {
                const net = computeEventDisplayAmount(ev);
                const walletName = computeEventWalletName(ev);
                const fundName = computeEventFundName(ev);
                const rowClassName = ev.isPending ? "italic" : "";

                return (
                  <Fragment key={ev.id}>
                    <TableRow className={rowClassName}>
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
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
