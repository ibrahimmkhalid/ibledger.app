"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { FieldError } from "@/app/tracker/components/field-error";
import { UnavailableActionButton } from "@/app/tracker/components/unavailable-action-button";
import {
  MultiFundSlider,
  type SliderFund,
} from "@/components/ui/multi-fund-slider";
import { FUND_SHARE_RANGE_ERROR, isValidFundShare } from "@/lib/fund-shares";
import { holdsMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Fund, Wallet } from "@/app/tracker/types";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

type FundFormState = {
  name: string;
  pullPercentage: string;
};

/** Percentages here are whole or half numbers; show the .5 only when needed. */
function fmtPercent(value: number) {
  const rounded = Math.round(value * 2) / 2;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function FundModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: FundFormState;
  disablePullPercentage?: boolean;
  /** Total share held by every other non-savings fund, for the remaining hint. */
  otherFundsShare: number;
  busy: boolean;
  /** Rejecting shows the reason inline; the caller need not toast it. */
  onSave: (data: FundFormState) => void | Promise<void>;
}) {
  const {
    open,
    onOpenChange,
    title,
    initial,
    disablePullPercentage,
    otherFundsShare,
    busy,
    onSave,
  } = args;
  const [name, setName] = useState(initial?.name ?? "");
  const [pullPercentage, setPullPercentage] = useState(
    initial?.pullPercentage ?? "0",
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const nameId = useId();
  const shareId = useId();
  const nameErrorId = useId();
  const shareErrorId = useId();

  // Same reason as WalletModal: `initial` is built inline by the caller, so
  // depending on its identity would re-run this on the re-render a failed save
  // causes and wipe the errors before they are painted.
  const initialName = initial?.name ?? "";
  const initialShare = initial?.pullPercentage ?? "0";

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setPullPercentage(initialShare);
    setNameError(null);
    setShareError(null);
  }, [open, initialName, initialShare]);

  const share = Number(pullPercentage);
  const remaining = isValidFundShare(share)
    ? Math.max(0, 100 - otherFundsShare - share)
    : null;

  async function save() {
    let invalid = false;

    if (!name.trim()) {
      setNameError("Give the fund a name");
      invalid = true;
    } else {
      setNameError(null);
    }

    if (!isValidFundShare(share)) {
      setShareError(FUND_SHARE_RANGE_ERROR);
      invalid = true;
    } else if (!disablePullPercentage && otherFundsShare + share > 100) {
      setShareError(
        `Your other funds already take ${fmtPercent(otherFundsShare)}, so this one can take at most ${fmtPercent(100 - otherFundsShare)}.`,
      );
      invalid = true;
    } else {
      setShareError(null);
    }

    if (invalid) return;

    try {
      await onSave({ name, pullPercentage });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't save this fund";
      // The server's own share complaints belong beside the share field.
      if (message.toLowerCase().includes("income share")) {
        setShareError(message);
      } else {
        setNameError(message);
      }
    }
  }

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
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              placeholder="e.g. Groceries"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
              className={cn(nameError && "border-destructive")}
            />
            <FieldError id={nameErrorId} message={nameError} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={shareId}>Income share (%)</Label>
            <Input
              id={shareId}
              inputMode="decimal"
              value={pullPercentage}
              onChange={(e) => {
                setPullPercentage(e.target.value);
                setShareError(null);
              }}
              disabled={Boolean(disablePullPercentage)}
              aria-invalid={shareError ? true : undefined}
              aria-describedby={shareError ? shareErrorId : undefined}
              className={cn(shareError && "border-destructive")}
            />
            <FieldError id={shareErrorId} message={shareError} />
            {!shareError && !disablePullPercentage && (
              <p className="text-muted-foreground text-xs">
                Your other funds take {fmtPercent(otherFundsShare)}.
                {remaining === null
                  ? ""
                  : ` Savings would keep ${fmtPercent(remaining)}.`}
              </p>
            )}
          </div>
        </div>
      )}
      renderFooter={() => (
        <Button type="button" onClick={() => void save()} disabled={busy}>
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

  const nonSavingsFunds = funds.filter((f) => !f.isSavings);
  const savingsFund = funds.find((f) => f.isSavings);
  const allocatedShare = nonSavingsFunds.reduce(
    (acc, fund) => acc + Number(fund.pullPercentage ?? 0),
    0,
  );
  const savingsShare = Math.max(0, 100 - allocatedShare);

  // Same bar as the Funds page, read-only here: shares are edited one fund at
  // a time through the modal, and this shows where that leaves the split.
  const sliderFunds: SliderFund[] = [
    ...nonSavingsFunds.map((fund) => ({
      id: String(fund.id),
      name: fund.name,
      percentage: Number(fund.pullPercentage ?? 0),
    })),
    ...(savingsFund
      ? [
          {
            id: String(savingsFund.id),
            name: savingsFund.name,
            percentage: savingsShare,
            isSavings: true,
          },
        ]
      : []),
  ];

  const shareForOtherFunds = (excludeFundId?: number) =>
    nonSavingsFunds
      .filter((fund) => fund.id !== excludeFundId)
      .reduce((acc, fund) => acc + Number(fund.pullPercentage ?? 0), 0);

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

  // These rethrow instead of toasting: the modals show the reason next to the
  // field that caused it.
  async function createWallet(data: WalletFormState) {
    setBusy(true);
    try {
      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name }),
      });
      setCreateWalletOpen(false);
      toast.success("Wallet created");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateWallet(wallet: Wallet, data: WalletFormState) {
    setBusy(true);
    try {
      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: data.name }),
      });
      setEditWallet(null);
      toast.success("Wallet updated");
      await refresh();
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
      await apiJson("/api/funds", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          pullPercentage: Number(data.pullPercentage),
        }),
      });
      setCreateFundOpen(false);
      toast.success("Fund created");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateFund(fund: Fund, data: FundFormState) {
    setBusy(true);
    try {
      await apiJson("/api/funds", {
        method: "PATCH",
        body: JSON.stringify({
          id: fund.id,
          name: data.name,
          pullPercentage: Number(data.pullPercentage),
        }),
      });
      setEditFund(null);
      toast.success("Fund updated");
      await refresh();
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

      <p className="text-muted-foreground max-w-2xl text-sm">
        Two lists to fill in.{" "}
        <strong className="text-foreground">Wallets</strong> are where your
        money physically sits;{" "}
        <strong className="text-foreground">funds</strong> are what it is set
        aside for. Every transaction names one of each. You can change all of
        this later.
      </p>

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
        otherFundsShare={shareForOtherFunds()}
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
        otherFundsShare={shareForOtherFunds(editFund?.id)}
        busy={busy}
        onSave={(data) => {
          if (!editFund) return;
          return updateFund(editFund, data);
        }}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Wallets</CardTitle>
            <Button onClick={() => setCreateWalletOpen(true)}>
              <PlusIcon />
              New wallet
            </Button>
          </div>
          <CardDescription>
            Add every account your money actually sits in — a current account, a
            savings account, cash in your pocket. Balances come from the
            transactions you record, so there is nothing to enter here but a
            name.
          </CardDescription>
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
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void deleteWallet(w)}
                          disabled={busy || wallets.length <= 1}
                          aria-label={`Delete ${w.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon />
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
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Funds</CardTitle>
            <Button onClick={() => setCreateFundOpen(true)}>
              <PlusIcon />
              New fund
            </Button>
          </div>
          <CardDescription>
            Funds are what the money is for — rent, groceries, anything you
            budget separately. Each one takes a share of every income you
            record, and Savings keeps whatever is left over.
          </CardDescription>
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
                      {f.isSavings ? (
                        <span title="Whatever the other funds don't take">
                          {fmtPercent(savingsShare)}
                        </span>
                      ) : (
                        fmtPercent(Number(f.pullPercentage ?? 0))
                      )}
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
                          <PencilIcon />
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
                                    <Trash2Icon />
                                  </Button>
                                );
                              }

                              return (
                                <UnavailableActionButton
                                  label={`Can't delete ${f.name}`}
                                  reason="Still holds money (including pending). Move it out and clear pending transactions first."
                                >
                                  <Trash2Icon />
                                </UnavailableActionButton>
                              );
                            })()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {sliderFunds.length > 1 && (
            <div className="mt-4 border-t pt-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="font-medium">Income allocation</span>
                <span className="text-muted-foreground tabular-nums">
                  {fmtPercent(allocatedShare)} allocated ·{" "}
                  {fmtPercent(savingsShare)} left for{" "}
                  {savingsFund?.name ?? "Savings"}
                </span>
              </div>
              <MultiFundSlider
                funds={sliderFunds}
                onChange={() => {}}
                disabled
              />
              <p className="text-muted-foreground mt-3 text-xs">
                Edit a fund to change its share. Adjust them freely later on the
                Funds page, where this bar is draggable.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>One more thing: what you already have</CardTitle>
          <CardDescription>
            Your ledger starts at $0.00 — there is no opening-balance field,
            because every balance is worked out from the transactions you
            record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            So if you already have money in these accounts, record it once as
            your first transaction: <strong>Add transaction</strong>, one line
            per wallet, direction <strong>In</strong>, for the amount that is
            sitting there. Put it against{" "}
            <strong>{savingsFund?.name ?? "Savings"}</strong> unless it is
            already earmarked for something — money entered this way is not
            split by your income shares, so it lands exactly where you put it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
