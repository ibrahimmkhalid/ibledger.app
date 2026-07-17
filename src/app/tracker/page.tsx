"use client";

import { useCallback, useEffect, useState } from "react";

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

import { EventModals } from "@/app/tracker/components/event-modals";
import { ClearedWithPending } from "@/app/tracker/components/cleared-with-pending";
import { OverviewSkeleton } from "@/app/tracker/components/loading-skeletons";
import { TransactionEventCard } from "@/app/tracker/components/transaction-event-card";
import { apiJson } from "@/app/tracker/lib/api";
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import { fmtAmount } from "@/app/tracker/lib/format";
import type {
  EventsResponse,
  Fund,
  OverviewTotals,
  TransactionEvent,
  Wallet,
} from "@/app/tracker/types";

type OverviewResponse = OverviewTotals & EventsResponse;

function overspentBadge(args: { raw: number; label?: string }) {
  const raw = Number(args.raw);
  if (!Number.isFinite(raw) || raw >= 0) return null;
  return (
    <span className="bg-destructive/10 text-destructive inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold">
      Overspent{args.label ? ` (${args.label})` : ""} {fmtAmount(-raw)}
    </span>
  );
}

export default function TrackerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [totals, setTotals] = useState<OverviewTotals | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  const [createTransactionOpen, setCreateTransactionOpen] = useState(false);
  const [createIncomeOpen, setCreateIncomeOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<TransactionEvent | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const ready = await checkBootstrapOrRedirect(router);
      if (!ready) return;

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

      <EventModals
        wallets={wallets}
        funds={funds}
        createTransactionOpen={createTransactionOpen}
        onCreateTransactionOpenChange={setCreateTransactionOpen}
        createIncomeOpen={createIncomeOpen}
        onCreateIncomeOpenChange={setCreateIncomeOpen}
        detailsEvent={detailsEvent}
        onDetailsEventChange={setDetailsEvent}
        onSaved={refresh}
      />

      <Card>
        <CardHeader>
          <CardTitle>Total balance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {totals ? (
            <div className="text-lg">
              <ClearedWithPending
                cleared={totals.grandTotal}
                withPending={totals.grandTotalWithPending}
              />
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
                      <ClearedWithPending
                        cleared={w.balance}
                        withPending={w.balanceWithPending}
                      />
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
                      <ClearedWithPending
                        cleared={f.balance}
                        withPending={f.balanceWithPending}
                      />
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
              <TransactionEventCard
                key={ev.id}
                event={ev}
                onClick={() => setDetailsEvent(ev)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
