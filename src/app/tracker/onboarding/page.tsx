"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { BootstrapResponse, Fund, Wallet } from "@/app/tracker/types";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type WalletFormState = {
  name: string;
  openingAmount: string;
};

function WalletModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: WalletFormState;
  busy: boolean;
  onSave: (data: WalletFormState) => void | Promise<void>;
}) {
  const { open, onOpenChange, title, initial, busy, onSave } = args;
  const [name, setName] = useState(initial?.name ?? "");
  const [openingAmount, setOpeningAmount] = useState(
    initial?.openingAmount ?? "0",
  );

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setOpeningAmount(initial?.openingAmount ?? "0");
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:min-w-[40rem]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Name</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-row gap-1">
              <div className="text-muted-foreground text-xs">
                Opening amount
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <FontAwesomeIcon
                      icon={faQuestionCircle}
                      className="text-muted-foreground mt-[2px] size-3.5 shrink-0 opacity-65"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      The initial balance of this wallet when you start
                      tracking.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <Input
              inputMode="decimal"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void onSave({ name, openingAmount })}
            disabled={busy}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FundFormState = {
  name: string;
  openingAmount: string;
  pullPercentage: string;
};

function FundModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: FundFormState;
  disablePullPercentage?: boolean;
  busy: boolean;
  onSave: (data: FundFormState) => void | Promise<void>;
}) {
  const {
    open,
    onOpenChange,
    title,
    initial,
    disablePullPercentage,
    busy,
    onSave,
  } = args;
  const [name, setName] = useState(initial?.name ?? "");
  const [openingAmount, setOpeningAmount] = useState(
    initial?.openingAmount ?? "0",
  );
  const [pullPercentage, setPullPercentage] = useState(
    initial?.pullPercentage ?? "0",
  );

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setOpeningAmount(initial?.openingAmount ?? "0");
    setPullPercentage(initial?.pullPercentage ?? "0");
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:min-w-[40rem]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Name</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-row gap-1">
              <div className="text-muted-foreground text-xs">
                Opening amount
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <FontAwesomeIcon
                      icon={faQuestionCircle}
                      className="text-muted-foreground mt-[2px] size-3.5 shrink-0 opacity-65"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      The initial balance of this fund when you start tracking.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              inputMode="decimal"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-row gap-1">
              <div className="text-muted-foreground text-xs">
                Pull percentage
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <FontAwesomeIcon
                      icon={faQuestionCircle}
                      className="text-muted-foreground mt-[2px] size-3.5 shrink-0 opacity-65"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      What percentage of an income transaction to save into this
                      fund. The rest will be saved in the savings fund.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              inputMode="decimal"
              value={pullPercentage}
              onChange={(e) => setPullPercentage(e.target.value)}
              disabled={Boolean(disablePullPercentage)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void onSave({ name, openingAmount, pullPercentage })}
            disabled={busy}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [createWalletOpen, setCreateWalletOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);

  const [createFundOpen, setCreateFundOpen] = useState(false);
  const [editFund, setEditFund] = useState<Fund | null>(null);

  const canFinish = wallets.length > 0 && funds.length > 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await apiJson<BootstrapResponse>("/api/bootstrap", {
        method: "POST",
        body: "{}",
      });

      // Even if onboarding is no longer required, allow users to revisit this
      // page to tweak initial setup.

      const [walletsRes, fundsRes] = await Promise.all([
        apiJson<{ wallets: Wallet[] }>("/api/wallets"),
        apiJson<{ funds: Fund[] }>("/api/funds"),
      ]);

      setWallets(walletsRes.wallets);
      setFunds(fundsRes.funds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load onboarding");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createWallet(data: WalletFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");

      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name, openingAmount }),
      });
      setCreateWalletOpen(false);
      setNotice("Wallet created");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function updateWallet(wallet: Wallet, data: WalletFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");

      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: data.name, openingAmount }),
      });
      setEditWallet(null);
      setNotice("Wallet updated");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update wallet");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWallet(wallet: Wallet) {
    const ok = window.confirm(
      `Delete wallet "${wallet.name}"? This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await apiJson("/api/wallets", {
        method: "DELETE",
        body: JSON.stringify({ id: wallet.id }),
      });
      setNotice("Wallet deleted");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete wallet");
    } finally {
      setBusy(false);
    }
  }

  async function createFund(data: FundFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      const pullPercentage = Number(data.pullPercentage);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");
      if (
        Number.isNaN(pullPercentage) ||
        pullPercentage < 0 ||
        pullPercentage > 100
      ) {
        throw new Error("Invalid pull percentage");
      }

      await apiJson("/api/funds", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          openingAmount,
          pullPercentage,
        }),
      });
      setCreateFundOpen(false);
      setNotice("Fund created");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create fund");
    } finally {
      setBusy(false);
    }
  }

  async function updateFund(fund: Fund, data: FundFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      const pullPercentage = Number(data.pullPercentage);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");
      if (
        Number.isNaN(pullPercentage) ||
        pullPercentage < 0 ||
        pullPercentage > 100
      ) {
        throw new Error("Invalid pull percentage");
      }

      await apiJson("/api/funds", {
        method: "PATCH",
        body: JSON.stringify({
          id: fund.id,
          name: data.name,
          openingAmount,
          pullPercentage,
        }),
      });
      setEditFund(null);
      setNotice("Fund updated");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update fund");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFund(fund: Fund) {
    const ok = window.confirm(
      `Delete fund "${fund.name}"? This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await apiJson("/api/funds", {
        method: "DELETE",
        body: JSON.stringify({ id: fund.id }),
      });
      setNotice("Fund deleted");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete fund");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setting things up…</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Create your wallets and funds to start tracking.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Welcome</h1>
          <div className="text-muted-foreground text-sm">
            To get started, add your own wallets and funds! We have already
            started you off with a default savings fund and bank wallet. Take a
            look or go straight to the tracker! You can always modify these
            later.
          </div>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-2">
          <Button
            onClick={async () => {
              try {
                await apiJson("/api/onboard", {
                  method: "POST",
                  body: "{}",
                });
              } catch {
                // Do nothing
              } finally {
                router.push("/tracker");
              }
            }}
            disabled={!canFinish}
          >
            Complete onboarding
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

      <WalletModal
        open={createWalletOpen}
        onOpenChange={setCreateWalletOpen}
        title="New wallet"
        busy={busy}
        onSave={createWallet}
      />

      <WalletModal
        open={Boolean(editWallet)}
        onOpenChange={(open: boolean) => {
          if (!open) setEditWallet(null);
        }}
        title="Edit wallet"
        initial={
          editWallet
            ? {
                name: editWallet.name,
                openingAmount: String(editWallet.openingAmount),
              }
            : undefined
        }
        busy={busy}
        onSave={(data) => {
          if (!editWallet) return;
          return updateWallet(editWallet, data);
        }}
      />

      <FundModal
        open={createFundOpen}
        onOpenChange={setCreateFundOpen}
        title="New fund"
        busy={busy}
        onSave={createFund}
      />

      <FundModal
        open={Boolean(editFund)}
        onOpenChange={(open: boolean) => {
          if (!open) setEditFund(null);
        }}
        title="Edit fund"
        initial={
          editFund
            ? {
                name: editFund.name,
                openingAmount: String(editFund.openingAmount),
                pullPercentage: String(editFund.pullPercentage ?? 0),
              }
            : undefined
        }
        disablePullPercentage={Boolean(editFund?.isSavings)}
        busy={busy}
        onSave={(data) => {
          if (!editFund) return;
          return updateFund(editFund, data);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Wallets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-muted-foreground text-sm">
              We have set up a default &quot;Bank&quot; wallet for you. Add more
              if you need!
            </div>
            <Button onClick={() => setCreateWalletOpen(true)}>
              New wallet
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[160px] text-right">Opening</TableHead>
                <TableHead className="w-[200px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No wallets yet.
                  </TableCell>
                </TableRow>
              ) : (
                wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(w.openingAmount)}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setEditWallet(w)}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void deleteWallet(w)}
                        disabled={busy || wallets.length <= 1}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-muted-foreground text-sm">
              We have set up a default &quot;Savings&quot; fund for you. Add
              more if you need!
            </div>
            <Button onClick={() => setCreateFundOpen(true)}>New fund</Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[110px]">Savings</TableHead>
                <TableHead className="w-[130px] text-right">Pull %</TableHead>
                <TableHead className="w-[160px] text-right">Opening</TableHead>
                <TableHead className="w-[220px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No funds yet.
                  </TableCell>
                </TableRow>
              ) : (
                funds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.isSavings ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.isSavings ? "—" : `${Number(f.pullPercentage ?? 0)}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(f.openingAmount)}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setEditFund(f)}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      {f.isSavings ? null : (
                        <Button
                          variant="destructive"
                          onClick={() => void deleteFund(f)}
                          disabled={busy}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
