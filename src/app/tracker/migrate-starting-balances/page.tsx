"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { apiJson } from "@/app/tracker/lib/api";
import { fmtAmount } from "@/app/tracker/lib/format";
import { MigrationSkeleton } from "@/app/tracker/components/loading-skeletons";

const TOLERANCE = 0.005;

type LegacyWallet = {
  id: number;
  name: string;
  legacyAmount: number;
};

type LegacyFund = {
  id: number;
  name: string;
  isSavings: boolean;
  legacyAmount: number;
};

type MigrationResponse = {
  required: boolean;
  wallets: LegacyWallet[];
  funds: LegacyFund[];
  walletTotal: number;
  fundTotal: number;
  totalsMatch: boolean;
};

type AllocationEntry = {
  key: string;
  walletId: string;
  fundId: string;
  amount: string;
};

type Source = "wallets" | "funds";

function isNonZero(amount: number) {
  return Math.abs(Number(amount)) > TOLERANCE;
}

function near(a: number, b: number) {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 1;
}

function sumBy<T extends { id: number }>(
  entries: AllocationEntry[],
  key: "walletId" | "fundId",
  accounts: T[],
) {
  const sums = new Map(accounts.map((account) => [account.id, 0]));
  for (const entry of entries) {
    const id = Number(entry[key]);
    const amount = Number(entry.amount);
    if (!id || !Number.isFinite(amount)) continue;
    sums.set(id, (sums.get(id) ?? 0) + amount);
  }
  return sums;
}

function firstId<T extends { id: number }>(accounts: T[]) {
  return accounts[0]?.id ? String(accounts[0].id) : "";
}

function buildEntries(data: MigrationResponse, source: Source) {
  const walletSources = data.wallets.filter((wallet) =>
    isNonZero(Number(wallet.legacyAmount)),
  );
  const fundSources = data.funds.filter((fund) =>
    isNonZero(Number(fund.legacyAmount)),
  );

  if (walletSources.length > 0 && fundSources.length > 0 && data.totalsMatch) {
    const remainingFunds = new Map(
      fundSources.map((fund) => [fund.id, Number(fund.legacyAmount)]),
    );
    const rows: AllocationEntry[] = [];

    for (const wallet of walletSources) {
      let remainingWallet = Number(wallet.legacyAmount);

      while (isNonZero(remainingWallet)) {
        const sameDirectionFund =
          fundSources.find((fund) => {
            const remaining = remainingFunds.get(fund.id) ?? 0;
            return (
              isNonZero(remaining) &&
              Math.sign(remaining) === Math.sign(remainingWallet)
            );
          }) ??
          fundSources.find((fund) =>
            isNonZero(remainingFunds.get(fund.id) ?? 0),
          );

        if (!sameDirectionFund) break;

        const remainingFund = remainingFunds.get(sameDirectionFund.id) ?? 0;
        const amount =
          Math.sign(remainingFund) === Math.sign(remainingWallet)
            ? Math.sign(remainingWallet) *
              Math.min(Math.abs(remainingWallet), Math.abs(remainingFund))
            : remainingWallet;

        rows.push({
          key: crypto.randomUUID(),
          walletId: String(wallet.id),
          fundId: String(sameDirectionFund.id),
          amount: String(Math.round(amount * 100) / 100),
        });

        remainingWallet -= amount;
        remainingFunds.set(sameDirectionFund.id, remainingFund - amount);
      }
    }

    return rows;
  }

  if (source === "wallets") {
    const fundId = firstId(data.funds);
    return walletSources.map((wallet) => ({
      key: crypto.randomUUID(),
      walletId: String(wallet.id),
      fundId,
      amount: String(wallet.legacyAmount),
    }));
  }

  const walletId = firstId(data.wallets);
  return fundSources.map((fund) => ({
    key: crypto.randomUUID(),
    walletId,
    fundId: String(fund.id),
    amount: String(fund.legacyAmount),
  }));
}

function AccountSelect(args: {
  value: string;
  onValueChange: (value: string) => void;
  accounts: Array<{ id: number; name: string }>;
  disabled?: boolean;
}) {
  return (
    <Select
      value={args.value}
      onValueChange={args.onValueChange}
      disabled={args.disabled}
    >
      <SelectTrigger className="h-8 w-full min-w-[10rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {args.accounts.map((account) => (
          <SelectItem key={account.id} value={String(account.id)}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function MigrateStartingBalancesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MigrationResponse | null>(null);
  const [source, setSource] = useState<Source>("wallets");
  const [entries, setEntries] = useState<AllocationEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiJson<MigrationResponse>(
        "/api/legacy-starting-balances",
      );

      if (!res.required) {
        router.replace("/tracker");
        return;
      }

      const initialSource =
        res.wallets.some((wallet) => isNonZero(wallet.legacyAmount)) ||
        !res.funds.some((fund) => isNonZero(fund.legacyAmount))
          ? "wallets"
          : "funds";

      setData(res);
      setSource(initialSource);
      setEntries(buildEntries(res, initialSource));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load migration");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const walletSums = useMemo(
    () => (data ? sumBy(entries, "walletId", data.wallets) : new Map()),
    [data, entries],
  );
  const fundSums = useMemo(
    () => (data ? sumBy(entries, "fundId", data.funds) : new Map()),
    [data, entries],
  );

  const hasWalletLegacy =
    data?.wallets.some((wallet) => isNonZero(wallet.legacyAmount)) ?? false;
  const hasFundLegacy =
    data?.funds.some((fund) => isNonZero(fund.legacyAmount)) ?? false;
  const exactTwoSided =
    Boolean(data) &&
    hasWalletLegacy &&
    hasFundLegacy &&
    Boolean(data?.totalsMatch);

  const requireWalletMatch =
    exactTwoSided || source === "wallets" || !hasFundLegacy;
  const requireFundMatch =
    exactTwoSided || source === "funds" || !hasWalletLegacy;

  const validationError = useMemo(() => {
    if (!data) return "Migration data is still loading";
    if (data.wallets.length === 0) return "Create a wallet before migrating";
    if (data.funds.length === 0) return "Create a fund before migrating";
    if (entries.length === 0) return "Add at least one transaction line";

    for (const entry of entries) {
      if (!entry.walletId || !entry.fundId)
        return "Each line needs a wallet and fund";
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || !isNonZero(amount)) {
        return "Each line needs a non-zero amount";
      }
    }

    if (requireWalletMatch) {
      for (const wallet of data.wallets) {
        if (!near(walletSums.get(wallet.id) ?? 0, wallet.legacyAmount)) {
          return "Wallet allocations still need to match";
        }
      }
    }

    if (requireFundMatch) {
      for (const fund of data.funds) {
        if (!near(fundSums.get(fund.id) ?? 0, fund.legacyAmount)) {
          return "Fund allocations still need to match";
        }
      }
    }

    return null;
  }, [
    data,
    entries,
    fundSums,
    requireFundMatch,
    requireWalletMatch,
    walletSums,
  ]);

  function updateEntry(key: string, updates: Partial<AllocationEntry>) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.key === key ? { ...entry, ...updates } : entry,
      ),
    );
  }

  function addEntry() {
    if (!data) return;
    setEntries((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        walletId: firstId(data.wallets),
        fundId: firstId(data.funds),
        amount: "",
      },
    ]);
  }

  function resetToSource(nextSource: Source) {
    if (!data) return;
    setSource(nextSource);
    setEntries(buildEntries(data, nextSource));
  }

  async function migrate() {
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setBusy(true);

    try {
      await apiJson("/api/legacy-starting-balances", {
        method: "POST",
        body: JSON.stringify({
          source,
          entries: entries.map((entry) => ({
            walletId: Number(entry.walletId),
            fundId: Number(entry.fundId),
            amount: Number(entry.amount),
          })),
        }),
      });

      router.replace("/tracker");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to migrate balances");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <MigrationSkeleton />;
  }

  if (!data) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {error ?? "Migration data could not be loaded."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Convert legacy balances</h1>
          <div className="text-muted-foreground max-w-2xl text-sm">
            Assign each legacy balance to both a wallet and a fund. Completing
            this creates cleared transactions and removes the legacy values from
            future calculations.
          </div>
        </div>
        <Button
          onClick={() => void migrate()}
          disabled={busy || Boolean(validationError)}
        >
          Create transactions
        </Button>
      </div>

      {!data.totalsMatch && hasWalletLegacy && hasFundLegacy && (
        <Card className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <CardHeader>
            <CardTitle>Choose the total to preserve</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              Legacy wallet total is {fmtAmount(data.walletTotal)} and legacy
              fund total is {fmtAmount(data.fundTotal)}. A valid ledger needs
              one total, so choose which side the transaction lines must match.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={source === "wallets" ? "default" : "outline"}
                onClick={() => resetToSource("wallets")}
                disabled={busy}
              >
                Preserve wallets
              </Button>
              <Button
                variant={source === "funds" ? "default" : "outline"}
                onClick={() => resetToSource("funds")}
                disabled={busy}
              >
                Preserve funds
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wallet legacy totals</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Legacy</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.wallets.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell>{wallet.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(wallet.legacyAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(walletSums.get(wallet.id) ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fund legacy totals</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Legacy</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.funds.map((fund) => (
                  <TableRow key={fund.id}>
                    <TableCell>{fund.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(fund.legacyAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(fundSums.get(fund.id) ?? 0)}
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
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Transaction lines</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={addEntry}
              disabled={busy}
            >
              <Plus className="h-4 w-4" />
              Add line
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wallet</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead className="w-[160px] text-right">Amount</TableHead>
                <TableHead className="w-[48px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell>
                    <AccountSelect
                      value={entry.walletId}
                      onValueChange={(walletId) =>
                        updateEntry(entry.key, { walletId })
                      }
                      accounts={data.wallets}
                      disabled={busy}
                    />
                  </TableCell>
                  <TableCell>
                    <AccountSelect
                      value={entry.fundId}
                      onValueChange={(fundId) =>
                        updateEntry(entry.key, { fundId })
                      }
                      accounts={data.funds}
                      disabled={busy}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      value={entry.amount}
                      onChange={(e) =>
                        updateEntry(entry.key, { amount: e.target.value })
                      }
                      disabled={busy}
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEntries((prev) =>
                          prev.filter(
                            (candidate) => candidate.key !== entry.key,
                          ),
                        )
                      }
                      disabled={busy || entries.length <= 1}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {validationError && (
            <div className="text-muted-foreground text-sm">
              {validationError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
