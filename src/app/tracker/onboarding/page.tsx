"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { HowToUseGuide } from "@/app/how-to-use/guide";
import { apiJson } from "@/app/tracker/lib/api";
import {
  WalletModal,
  type WalletFormState,
} from "@/app/tracker/components/wallet-modal";
import { ResponsiveModal } from "@/app/tracker/components/responsive-modal";
import { useConfirm } from "@/app/tracker/components/confirm-dialog";
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import { OnboardingSkeleton } from "@/app/tracker/components/loading-skeletons";
import { holdsMoney } from "@/lib/money";
import type { Fund, Wallet } from "@/app/tracker/types";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ArrowLeftIcon, ArrowRightIcon, Pencil, Trash2 } from "lucide-react";

type FundFormState = {
  name: string;
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
  const [pullPercentage, setPullPercentage] = useState(
    initial?.pullPercentage ?? "0",
  );
  const nameId = useId();
  const shareId = useId();

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setPullPercentage(initial?.pullPercentage ?? "0");
  }, [open, initial]);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desktopContentClassName="sm:max-w-[min(40rem,calc(100vw-2rem))]"
      renderBody={() => (
        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={shareId}>Income share</Label>
            <Input
              id={shareId}
              inputMode="decimal"
              value={pullPercentage}
              onChange={(e) => setPullPercentage(e.target.value)}
              disabled={Boolean(disablePullPercentage)}
            />
          </div>
        </div>
      )}
      renderFooter={() => (
        <Button
          type="button"
          onClick={() => void onSave({ name, pullPercentage })}
          disabled={busy}
        >
          Save
        </Button>
      )}
    />
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // A first run opens on the guide; a revisit (to tweak wallets and funds
  // later) goes straight to setup. Decided once, on the first bootstrap —
  // refresh() runs again after every create/delete, and onboarding stays
  // "required" until Finish setup, so re-deciding would bounce the user back
  // to the guide mid-setup.
  const [step, setStep] = useState<"guide" | "setup">("setup");
  const stepDecided = useRef(false);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [createWalletOpen, setCreateWalletOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);

  const [createFundOpen, setCreateFundOpen] = useState(false);
  const [editFund, setEditFund] = useState<Fund | null>(null);

  const canFinish = wallets.length > 0 && funds.length > 0;

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const boot = await checkBootstrapOrRedirect(router, {
        skipOnboarding: true,
      });
      if (!boot) return;

      if (!stepDecided.current) {
        stepDecided.current = true;
        setStep(boot.onboarding?.required ? "guide" : "setup");
      }

      const [walletsRes, fundsRes] = await Promise.all([
        apiJson<{ wallets: Wallet[] }>("/api/wallets"),
        apiJson<{ funds: Fund[] }>("/api/funds"),
      ]);

      setWallets(walletsRes.wallets);
      setFunds(fundsRes.funds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load onboarding");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createWallet(data: WalletFormState) {
    setBusy(true);
    try {
      if (!data.name.trim()) throw new Error("Name is required");

      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name }),
      });
      setCreateWalletOpen(false);
      toast.success("Wallet created");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function updateWallet(wallet: Wallet, data: WalletFormState) {
    setBusy(true);
    try {
      if (!data.name.trim()) throw new Error("Name is required");

      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: data.name }),
      });
      setEditWallet(null);
      toast.success("Wallet updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update wallet");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWallet(wallet: Wallet) {
    const ok = await confirm({
      title: `Delete "${wallet.name}"?`,
      description:
        "This wallet and its history will be removed. You can't undo this.",
      confirmLabel: "Delete wallet",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiJson("/api/wallets", {
        method: "DELETE",
        body: JSON.stringify({ id: wallet.id }),
      });
      toast.success("Wallet deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete wallet");
    } finally {
      setBusy(false);
    }
  }

  async function createFund(data: FundFormState) {
    setBusy(true);
    try {
      const pullPercentage = Number(data.pullPercentage);
      if (!data.name.trim()) throw new Error("Name is required");
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
          pullPercentage,
        }),
      });
      setCreateFundOpen(false);
      toast.success("Fund created");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create fund");
    } finally {
      setBusy(false);
    }
  }

  async function updateFund(fund: Fund, data: FundFormState) {
    setBusy(true);
    try {
      const pullPercentage = Number(data.pullPercentage);
      if (!data.name.trim()) throw new Error("Name is required");
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
          pullPercentage,
        }),
      });
      setEditFund(null);
      toast.success("Fund updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update fund");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFund(fund: Fund) {
    const ok = await confirm({
      title: `Delete "${fund.name}"?`,
      description: "This fund will be removed. You can't undo this.",
      confirmLabel: "Delete fund",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiJson("/api/funds", {
        method: "DELETE",
        body: JSON.stringify({ id: fund.id }),
      });
      toast.success("Fund deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete fund");
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
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
  }

  if (loading) {
    return <OnboardingSkeleton />;
  }

  if (step === "guide") {
    return (
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Welcome to ibLedger</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setStep("setup")}>
              Set up my ledger
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>

        <HowToUseGuide />

        <div className="border-border flex justify-end border-t pt-6">
          <Button onClick={() => setStep("setup")}>
            Set up my ledger
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Set up your ledger</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setStep("guide")}>
            <ArrowLeftIcon data-icon="inline-start" />
            How it works
          </Button>
          <Button onClick={() => void finishSetup()} disabled={!canFinish}>
            Finish setup
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>

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
          <div className="flex items-center justify-between">
            <CardTitle>Wallets</CardTitle>
            <Button onClick={() => setCreateWalletOpen(true)}>
              New wallet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No wallets yet.
                  </TableCell>
                </TableRow>
              ) : (
                wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2 sm:gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditWallet(w)}
                          disabled={busy}
                          aria-label={`Edit ${w.name}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void deleteWallet(w)}
                          disabled={busy || wallets.length <= 1}
                          aria-label={`Delete ${w.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </div>
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
          <div className="flex items-center justify-between">
            <CardTitle>Funds</CardTitle>
            <Button onClick={() => setCreateFundOpen(true)}>New fund</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Savings</TableHead>
                <TableHead className="text-right">Income share</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No funds yet.
                  </TableCell>
                </TableRow>
              ) : (
                funds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.isSavings ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.isSavings ? "-" : `${Number(f.pullPercentage ?? 0)}%`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2 sm:gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditFund(f)}
                          disabled={busy}
                          aria-label={`Edit ${f.name}`}
                        >
                          <Pencil />
                        </Button>
                        {f.isSavings
                          ? null
                          : (() => {
                              const deleteBlocked = holdsMoney(
                                Number(
                                  f.rawBalanceWithPending ??
                                    f.balanceWithPending,
                                ),
                              );

                              if (!deleteBlocked) {
                                return (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => void deleteFund(f)}
                                    disabled={busy}
                                    aria-label={`Delete ${f.name}`}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 />
                                  </Button>
                                );
                              }

                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {/* The span (not the inert Button) takes
                                        focus, so it must carry the control's
                                        semantics. */}
                                    <span
                                      tabIndex={0}
                                      role="button"
                                      aria-disabled="true"
                                      aria-label={`Can't delete ${f.name}: still holds money`}
                                      className="inline-flex"
                                    >
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled
                                        aria-hidden
                                        className="text-muted-foreground pointer-events-none"
                                      >
                                        <Trash2 />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    This fund still holds money (including
                                    pending). Move it out and clear pending
                                    transactions before deleting.
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                      </div>
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
