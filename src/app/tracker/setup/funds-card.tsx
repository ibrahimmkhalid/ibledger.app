"use client";

import { useMemo, useState } from "react";

import { toast } from "sonner";
import {
  CheckIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ClearedWithPending } from "@/app/tracker/components/cleared-with-pending";
import { fmtAmount } from "@/app/tracker/lib/format";
import { holdsMoney } from "@/lib/money";
import type { Fund } from "@/app/tracker/types";
import {
  MultiFundSlider,
  type SliderFund,
} from "@/components/ui/multi-fund-slider";
import { seriesColorForKey } from "@/app/tracker/lib/series-colors";
import { Swatch } from "@/components/ui/swatch";
import { UnavailableActionButton } from "@/app/tracker/components/unavailable-action-button";

type DraftFund = {
  key: string;
  id?: number;
  name: string;
  pullPercentage: number;
  isSavings: boolean;
  balance: number;
  balanceWithPending: number;
  rawBalance?: number;
  rawBalanceWithPending?: number;
};

/** Round to nearest 0.5. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Format a percentage, showing .0 or .5 only when needed. */
function fmtPct(n: number): string {
  const rounded = roundHalf(n);
  if (Number.isInteger(rounded)) {
    return `${Math.round(rounded)}%`;
  }
  return `${rounded}%`;
}

function fundToDraft(f: Fund): DraftFund {
  return {
    key: String(f.id),
    id: f.id,
    name: f.name,
    pullPercentage: f.pullPercentage,
    isSavings: f.isSavings,
    balance: f.balance,
    balanceWithPending: f.balanceWithPending,
    rawBalance: f.rawBalance,
    rawBalanceWithPending: f.rawBalanceWithPending,
  };
}

/** Scales non-savings shares down to a total of 100. Never scales up. */
function normaliseDraft(drafts: DraftFund[]): DraftFund[] {
  const out = drafts.map((d) => ({ ...d }));
  const nonSavings = out.filter((f) => !f.isSavings);

  const total = nonSavings.reduce((s, f) => s + f.pullPercentage, 0);
  if (total <= 100) return out;

  const scale = 100 / total;
  for (const f of nonSavings) {
    f.pullPercentage = roundHalf(f.pullPercentage * scale);
  }

  // roundHalf drifts either side of 100. Positive drift goes on the largest
  // fund; negative drift is trimmed off the funds largest first.
  const drift = 100 - nonSavings.reduce((s, f) => s + f.pullPercentage, 0);
  if (drift > 0) {
    const largest = nonSavings.reduce((a, b) =>
      b.pullPercentage > a.pullPercentage ? b : a,
    );
    largest.pullPercentage = roundHalf(largest.pullPercentage + drift);
  } else if (drift < 0) {
    let remaining = -drift;
    const byShare = [...nonSavings].sort(
      (a, b) => b.pullPercentage - a.pullPercentage,
    );
    for (const f of byShare) {
      if (remaining <= 0) break;
      const cut = Math.min(f.pullPercentage, remaining);
      f.pullPercentage = roundHalf(f.pullPercentage - cut);
      remaining = roundHalf(remaining - cut);
    }
  }

  return out;
}

// Scaled figures are numbers the user never typed, so the form starts dirty
// and says why rather than showing a total that is not in the database.
function buildDraft(funds: Fund[]) {
  const fromServer = funds.map(fundToDraft);
  const normalised = normaliseDraft(fromServer);
  const rescaled = normalised.some(
    (fund, index) => fund.pullPercentage !== fromServer[index].pullPercentage,
  );
  return { drafts: normalised, rescaled };
}

/** The slider's array: non-savings funds in order, savings last. */
function buildSliderFunds(drafts: DraftFund[]): SliderFund[] {
  const nonSavings = drafts.filter((f) => !f.isSavings);
  const savings = drafts.find((f) => f.isSavings);
  const nsTotal = nonSavings.reduce((s, f) => s + f.pullPercentage, 0);

  const result: SliderFund[] = nonSavings.map((f) => ({
    id: f.key,
    name: f.name || "Unnamed",
    percentage: f.pullPercentage,
  }));

  if (savings) {
    result.push({
      id: savings.key,
      name: savings.name || "Savings",
      percentage: Math.max(0, 100 - nsTotal),
      isSavings: true,
    });
  }

  return result;
}

function canDeleteFund(d: DraftFund): { ok: boolean; reason?: string } {
  if (d.isSavings) return { ok: false, reason: "Savings can't be deleted" };
  if (!d.id) return { ok: true };
  const raw = Number(d.rawBalanceWithPending ?? d.balanceWithPending);
  if (holdsMoney(raw)) {
    return {
      ok: false,
      reason: "Still holds money (including pending). Move it out first.",
    };
  }
  return { ok: true };
}

/**
 * Edits are drafted here and committed by Confirm. The card is remounted on
 * every landed reload, so the draft is seeded from props and never resynced.
 */
export function FundsCard(args: {
  serverFunds: Fund[];
  onReload: () => Promise<boolean>;
}) {
  const { serverFunds, onReload } = args;

  const [initial] = useState(() => buildDraft(serverFunds));
  const [draftFunds, setDraftFunds] = useState<DraftFund[]>(initial.drafts);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(initial.rescaled);
  const [busy, setBusy] = useState(false);

  const sliderFunds = useMemo(() => buildSliderFunds(draftFunds), [draftFunds]);

  /** Display order: non-savings first, savings last. */
  const orderedDraft = useMemo(() => {
    const ns = draftFunds.filter((f) => !f.isSavings);
    const sv = draftFunds.filter((f) => f.isSavings);
    return [...ns, ...sv];
  }, [draftFunds]);

  /** Non-savings pull-% total from the server, for the "previously saved" block. */
  const serverNsTotal = useMemo(
    () =>
      serverFunds
        .filter((f) => !f.isSavings)
        .reduce((s, f) => s + (f.pullPercentage ?? 0), 0),
    [serverFunds],
  );

  function updateDraft(key: string, updates: Partial<DraftFund>) {
    setDraftFunds((prev) =>
      prev.map((f) => (f.key === key ? { ...f, ...updates } : f)),
    );
    setDirty(true);
  }

  function handleSliderChange(updated: SliderFund[]) {
    setDraftFunds((prev) =>
      prev.map((draft) => {
        if (draft.isSavings) return draft; // savings is always derived
        const sf = updated.find((u) => u.id === draft.key);
        if (!sf) return draft;
        return { ...draft, pullPercentage: sf.percentage };
      }),
    );
    setDirty(true);
  }

  function addFund() {
    // Starts at 0: a new fund takes no income until it is dragged a share, and
    // adding one must not quietly take income away from the funds already set.
    setDraftFunds((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        name: "",
        pullPercentage: 0,
        isSavings: false,
        balance: 0,
        balanceWithPending: 0,
      },
    ]);
    setDirty(true);
  }

  function removeFund(key: string) {
    const fund = draftFunds.find((f) => f.key === key);
    if (!fund || fund.isSavings) return;

    setDraftFunds((prev) => prev.filter((f) => f.key !== key));
    if (fund.id) {
      setDeletedIds((prev) => [...prev, fund.id!]);
    }
    setDirty(true);
  }

  function revert() {
    setDraftFunds(initial.drafts);
    setDeletedIds([]);
    setDirty(initial.rescaled);
  }

  async function confirmChanges() {
    setBusy(true);

    try {
      for (const f of draftFunds) {
        if (!f.name.trim()) throw new Error("All funds must have a name");
      }

      await apiJson("/api/funds/sync", {
        method: "PUT",
        body: JSON.stringify({
          funds: draftFunds.map((f) => ({
            id: f.id,
            name: f.name.trim(),
            pullPercentage: f.isSavings ? 0 : f.pullPercentage,
          })),
          deletedIds,
        }),
      });

      toast.success("Changes saved");
      // A landed reload remounts this card, which is what clears busy and the
      // draft. When it fails the draft is the only copy of what was saved.
      if (!(await onReload())) setBusy(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            Funds
            {dirty && (
              <span className="text-2xs rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                Unsaved changes
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addFund}
              disabled={busy}
            >
              <PlusIcon />
              Add fund
            </Button>
            {dirty ? (
              <Button
                variant="outline"
                size="sm"
                onClick={revert}
                disabled={busy}
              >
                <RotateCcwIcon />
                Revert
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onReload()}
                disabled={busy}
              >
                <RefreshCwIcon />
                Refresh
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void confirmChanges()}
              disabled={busy || !dirty}
            >
              <CheckIcon />
              Confirm
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {initial.rescaled && (
          <div
            role="status"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
          >
            Your saved income shares added up to more than 100%. They have been
            scaled back to fit. Press Confirm to save the correction.
          </div>
        )}

        {sliderFunds.length > 1 && (
          <MultiFundSlider
            funds={sliderFunds}
            onChange={handleSliderChange}
            disabled={busy}
          />
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-0"></TableHead>
              <TableHead className="w-1/2">Name</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-0"></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {orderedDraft.map((f) => {
              const del = canDeleteFund(f);

              return (
                <TableRow key={f.key}>
                  <TableCell>
                    <Swatch
                      color={seriesColorForKey(f.key, f.isSavings).bg}
                      hatched={f.isSavings}
                    />
                  </TableCell>

                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2">
                      {/* This is the page for editing fund names, so the
                          field takes the width the table has spare rather
                          than truncating mid-name inside 200px. */}
                      <Input
                        value={f.name}
                        onChange={(e) =>
                          updateDraft(f.key, { name: e.target.value })
                        }
                        placeholder="Fund name"
                        aria-label={`Name of ${f.name || "new fund"}`}
                        disabled={busy}
                        className="w-full min-w-0"
                      />
                      {!f.id && (
                        <span className="text-2xs rounded bg-blue-100 px-1.5 py-0.5 font-semibold tracking-wider text-blue-800 uppercase dark:bg-blue-900/30 dark:text-blue-200">
                          New
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-right text-sm tabular-nums">
                    {f.id ? (
                      <ClearedWithPending
                        cleared={f.balance}
                        withPending={f.balanceWithPending}
                      />
                    ) : (
                      "-"
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2 sm:gap-1">
                      {!f.isSavings &&
                        (del.ok ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFund(f.key)}
                            disabled={busy}
                            aria-label={`Delete ${f.name || "fund"}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon />
                          </Button>
                        ) : (
                          <UnavailableActionButton
                            label={`Can't delete ${f.name || "fund"}`}
                            reason={del.reason ?? "Unavailable"}
                          >
                            <Trash2Icon />
                          </UnavailableActionButton>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {dirty && serverFunds.length > 0 && (
          <div className="rounded-md border border-dashed px-3 py-2.5 opacity-50">
            <div className="text-muted-foreground mb-1.5 text-sm font-medium">
              Previously saved
            </div>
            <div className="text-muted-foreground space-y-1.5 text-sm">
              {serverFunds.map((f) => {
                const displayPct = f.isSavings
                  ? fmtPct(Math.max(0, roundHalf(100 - serverNsTotal)))
                  : fmtPct(f.pullPercentage ?? 0);

                return (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
                  >
                    <span className="min-w-[100px] font-medium">{f.name}</span>
                    <span className="tabular-nums">
                      {displayPct} income share
                    </span>
                    <span className="opacity-40">·</span>
                    <span className="tabular-nums">
                      {fmtAmount(f.balance)} balance
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
