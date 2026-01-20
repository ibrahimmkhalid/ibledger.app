"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { InfoIcon } from "lucide-react";

type ApiError = { error: string };

type TotalsResponse = {
  grandTotal: number;
  grandTotalWithPending: number;
  wallets: Array<{
    id: number;
    name: string;
    balance: number;
    balanceWithPending: number;
  }>;
  funds: Array<{
    id: number;
    name: string;
    kind: string;
    balance: number;
    balanceWithPending: number;
  }>;
};

type Wallet = {
  id: number;
  name: string;
  openingAmount: number;
  balance: number;
  balanceWithPending: number;
};

type Fund = {
  id: number;
  name: string;
  kind: string;
  openingAmount: number;
  balance: number;
  balanceWithPending: number;
};

type TransactionChild = {
  id: number;
  amount: number;
  walletName: string | null;
  fundName: string | null;
  isPending: boolean;
  status: string;
};

type TransactionEvent = {
  id: number;
  occurredAt: string;
  description: string | null;
  isPending: boolean;
  status: string;
  children: TransactionChild[];
};

type EventsResponse = {
  events: TransactionEvent[];
};

type CreateType = "income" | "expense" | "fund_deposit";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json()) as T | ApiError;
  if (!res.ok) {
    throw new Error((data as ApiError)?.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function renderClearedWithPending(cleared: number, withPending: number) {
  const c = Number(cleared);
  const p = Number(withPending);
  return (
    <>
      <span className="font-semibold">{fmt(c)}</span>
      {p !== c && (
        <span className="text-muted-foreground ml-2">[{fmt(p)}]</span>
      )}
    </>
  );
}

const formControlClassName =
  "bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 h-7 rounded-md border px-2 py-0.5 text-sm w-full min-w-0 outline-none";

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sumWalletDelta(children: TransactionChild[]) {
  return children
    .filter((c) => c.status === "posted" && c.walletName)
    .reduce((acc, c) => acc + Number(c.amount), 0);
}

function sumFundDelta(children: TransactionChild[]) {
  return children
    .filter((c) => c.status === "posted" && c.fundName)
    .reduce((acc, c) => acc + Number(c.amount), 0);
}

function computeEventDisplayAmount(children: TransactionChild[]) {
  const walletDelta = sumWalletDelta(children);
  if (walletDelta !== 0) return walletDelta;
  return sumFundDelta(children);
}

export function TrackerClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [events, setEvents] = useState<TransactionEvent[]>([]);

  // "Insert row" transaction creator
  const [createType, setCreateType] = useState<CreateType>("expense");
  const [createDate, setCreateDate] = useState(today());
  const [createDesc, setCreateDesc] = useState("Transaction");
  const [createAmount, setCreateAmount] = useState("10");
  const [createWalletId, setCreateWalletId] = useState<string>("");
  const [createFundId, setCreateFundId] = useState<string>("");
  const [createPending, setCreatePending] = useState(true);

  const [expandedEventIds, setExpandedEventIds] = useState<
    Record<number, boolean>
  >({});

  const displayFunds = useMemo(
    () => funds.filter((f) => f.kind !== "income"),
    [funds],
  );

  const walletOptions = useMemo(
    () => wallets.map((w) => ({ id: w.id, name: w.name })),
    [wallets],
  );

  const fundOptions = useMemo(() => displayFunds, [displayFunds]);

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

      if (!createWalletId && walletsRes.wallets.length > 0) {
        setCreateWalletId(String(walletsRes.wallets[0].id));
      }

      const preferredFunds = fundsRes.funds.filter(
        (f) => f.kind === "regular" || f.kind === "savings",
      );

      const preferred =
        preferredFunds.find((f) => f.kind === "regular") ??
        preferredFunds.find((f) => f.kind === "savings");

      if (!createFundId && preferred) {
        setCreateFundId(String(preferred.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [createFundId, createWalletId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onTogglePending(eventId: number, nextPending: boolean) {
    setError(null);
    setNotice(null);

    try {
      await apiJson(`/api/transactions/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({ isPending: nextPending }),
      });

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update pending");
    }
  }

  async function onCreateEvent() {
    setError(null);
    setNotice(null);

    try {
      const amount = Number(createAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        throw new Error("Amount must be > 0");
      }

      const walletId = createWalletId ? Number(createWalletId) : null;
      if (!walletId) {
        throw new Error("Select a wallet");
      }

      if (createType === "income") {
        if (!walletId) {
          throw new Error("Select a wallet");
        }

        // Income allocates to funds based on configured pulls.
        await apiJson("/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            type: "income",
            occurredAt: createDate,
            description: createDesc,
            walletId,
            amount,
            isPending: createPending,
          }),
        });

        setNotice("Income event created");
        await refresh();
        return;
      }

      const fundId = Number(createFundId);
      if (!fundId) {
        throw new Error("Select a fund");
      }

      if (createType === "fund_deposit") {
        await apiJson("/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            type: "expense",
            occurredAt: createDate,
            description: createDesc,
            isPending: createPending,
            lines: [
              {
                walletId,
                fundId,
                amount: Math.abs(amount),
                isPending: createPending,
              },
            ],
          }),
        });

        setNotice("Fund deposit created");
        await refresh();
        return;
      }

      if (!walletId) {
        throw new Error("Select a wallet");
      }

      await apiJson("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: "expense",
          occurredAt: createDate,
          description: createDesc,
          isPending: createPending,
          lines: [
            {
              walletId,
              fundId,
              amount: -Math.abs(amount),
              isPending: createPending,
            },
          ],
        }),
      });

      setNotice("Expense event created");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create event");
    }
  }

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tracker</h1>
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
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
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>{w.name}</TableCell>
                    <TableCell>
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
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayFunds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.name}</TableCell>
                    <TableCell>
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
          <CardTitle>New Transaction</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Type</div>
            <select
              className={formControlClassName}
              value={createType}
              onChange={(e) => setCreateType(e.target.value as CreateType)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="fund_deposit">Fund deposit</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Date</div>
            <Input
              type="date"
              value={createDate}
              onChange={(e) => setCreateDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Description</div>
            <Input
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="Description"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Wallet</div>
            <select
              className={formControlClassName}
              value={createWalletId}
              onChange={(e) => setCreateWalletId(e.target.value)}
            >
              <option value="" disabled>
                Select
              </option>
              {walletOptions.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Fund</div>
            {createType === "income" ? (
              <div
                className={
                  formControlClassName +
                  " text-muted-foreground flex items-center"
                }
              >
                Auto (pulls)
              </div>
            ) : (
              <select
                className={formControlClassName}
                value={createFundId}
                onChange={(e) => setCreateFundId(e.target.value)}
              >
                <option value="" disabled>
                  Select
                </option>
                {fundOptions.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground text-xs">Amount</div>
              <Tooltip>
                <TooltipTrigger
                  className="text-muted-foreground hover:text-foreground inline-flex"
                  aria-label="Amount help"
                >
                  <InfoIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>
                  Expense: outflow. Fund deposit: inflow. Income uses pulls.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              inputMode="decimal"
              value={createAmount}
              onChange={(e) => setCreateAmount(e.target.value)}
              placeholder="Amount"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={createPending}
                onCheckedChange={setCreatePending}
              />
              <div className="text-sm">Pending</div>
            </div>
            <Button onClick={() => void onCreateEvent()}>
              Add transaction
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[140px]">Amount</TableHead>
                <TableHead className="w-[110px]">Pending</TableHead>
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => {
                const net = computeEventDisplayAmount(ev.children);
                const expanded = Boolean(expandedEventIds[ev.id]);

                return (
                  <Fragment key={ev.id}>
                    <TableRow>
                      <TableCell>
                        {new Date(ev.occurredAt).toDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {ev.description ?? "(no description)"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={net < 0 ? "text-destructive" : ""}>
                          {fmt(net)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={ev.isPending}
                          onCheckedChange={(checked) =>
                            void onTogglePending(ev.id, checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setExpandedEventIds((prev) => ({
                              ...prev,
                              [ev.id]: !expanded,
                            }))
                          }
                        >
                          {expanded ? "Hide" : "Details"}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {expanded && (
                      <TableRow key={`${ev.id}-details`}>
                        <TableCell colSpan={5} className="bg-muted/20">
                          <div className="text-muted-foreground mb-2 text-xs">
                            Breakdown
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Amount</TableHead>
                                <TableHead>Wallet</TableHead>
                                <TableHead>Fund</TableHead>
                                <TableHead>Pending</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ev.children.map((c) => (
                                <TableRow key={c.id}>
                                  <TableCell>{fmt(c.amount)}</TableCell>
                                  <TableCell>{c.walletName ?? ""}</TableCell>
                                  <TableCell>{c.fundName ?? ""}</TableCell>
                                  <TableCell>
                                    {c.isPending ? "yes" : "no"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
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
