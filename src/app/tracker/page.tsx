"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { OverviewSkeleton } from "@/app/tracker/components/loading-skeletons";
import { TransactionEventCard } from "@/app/tracker/components/transaction-event-card";
import { apiJson } from "@/app/tracker/lib/api";
import { fmtAmount } from "@/app/tracker/lib/format";
import { isIncomeLike } from "@/app/tracker/lib/events";
import type {
  BootstrapResponse,
  EventsResponse,
  Fund,
  TotalsResponse,
  TransactionEvent,
  Wallet,
} from "@/app/tracker/types";

type OverviewResponse = TotalsResponse & EventsResponse;

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

function overspentBadge(args: { raw: number; label?: string }) {
  const raw = Number(args.raw);
  if (!Number.isFinite(raw) || raw >= 0) return null;
  return (
    <span className="bg-destructive/10 text-destructive inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold">
      Overspent{args.label ? ` (${args.label})` : ""} {fmtAmount(-raw)}
    </span>
  );
}

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
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const [createTransactionOpen, setCreateTransactionOpen] = useState(false);
  const [createIncomeOpen, setCreateIncomeOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<TransactionEvent | null>(
    null,
  );

  const detailsIsIncome = detailsEvent ? isIncomeLike(detailsEvent) : false;

  const refresh = useCallback(async () => {
    setLoading(true);

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

      const overview = await apiJson<OverviewResponse>("/api/tracker/overview");

      setWallets(overview.wallets);
      setFunds(overview.funds);
      setTotals(overview);
      setEvents(overview.events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Prefetch sibling routes for instant navigation
  useEffect(() => {
    router.prefetch("/tracker/transactions");
    router.prefetch("/tracker/funds");
    router.prefetch("/tracker/wallets");
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex flex-wrap items-center gap-2">
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

      <TransactionModal
        open={createTransactionOpen}
        onOpenChange={setCreateTransactionOpen}
        wallets={wallets}
        funds={funds}
        onSaved={async () => {
          toast.success("Transaction saved");
          await refresh();
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={setCreateIncomeOpen}
        wallets={wallets}
        onSaved={async () => {
          toast.success("Income saved");
          await refresh();
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
          await refresh();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          toast.success("Transaction deleted");
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
          toast.success("Income updated");
          await refresh();
          setDetailsEvent(null);
        }}
        onDeleted={async () => {
          toast.success("Income deleted");
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
            <div className="text-muted-foreground">-</div>
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
                {funds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{f.name}</span>
                        {!f.isSavings &&
                          (overspentBadge({
                            raw: Number(f.rawBalance ?? f.balance),
                          }) ||
                            overspentBadge({
                              raw: Number(
                                f.rawBalanceWithPending ?? f.balanceWithPending,
                              ),
                              label: "pending",
                            }))}
                      </div>
                    </TableCell>
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
          <CardTitle>Recent Transactions</CardTitle>
          <CardAction>
            <Button
              variant="outline"
              onClick={() => router.push("/tracker/transactions")}
            >
              View all
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            {events.slice(0, 10).map((ev) => (
              <Fragment key={ev.id}>
                <TransactionEventCard
                  event={ev}
                  onClick={() => setDetailsEvent(ev)}
                />
              </Fragment>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
