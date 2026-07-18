"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

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
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import { ClearedWithPending } from "@/app/tracker/components/cleared-with-pending";
import { fmtAmount } from "@/app/tracker/lib/format";
import { holdsMoney } from "@/lib/money";
import type { Fund } from "@/app/tracker/types";
import {
  MultiFundSlider,
  type SliderFund,
} from "@/components/ui/multi-fund-slider";
import { keyToColorIndex, seriesColor } from "@/app/tracker/lib/series-colors";
import { Swatch } from "@/components/ui/swatch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FundsSkeleton } from "@/app/tracker/components/loading-skeletons";

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

/** Format a percentage for display — showing .0 or .5 only when needed. */
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

/**
 * Non-savings pulls have to leave savings a non-negative share, so they can
 * total at most 100. Any fund may sit at 0, meaning no income is routed to it,
 * and savings may sit at 0 when the others claim everything between them.
 *
 * Only ever scales down, and only for totals over 100 -- which the server now
 * rejects, so they can only come from rows written before it did.
 */
function normaliseDraft(drafts: DraftFund[]): DraftFund[] {
  const out = drafts.map((d) => ({ ...d }));
  const nonSavings = out.filter((f) => !f.isSavings);

  const total = nonSavings.reduce((s, f) => s + f.pullPercentage, 0);
  if (total <= 100) return out;

  const scale = 100 / total;
  for (const f of nonSavings) {
    f.pullPercentage = roundHalf(f.pullPercentage * scale);
  }

  // roundHalf can nudge the total a little either side of 100; settle the
  // difference on the largest fund, which is big enough to absorb it whichever
  // way it went. Rounding each fund up independently could otherwise push the
  // total back over 100.
  const drift = 100 - nonSavings.reduce((s, f) => s + f.pullPercentage, 0);
  if (drift !== 0) {
    const largest = nonSavings.reduce((a, b) =>
      b.pullPercentage > a.pullPercentage ? b : a,
    );
    largest.pullPercentage = Math.max(
      0,
      roundHalf(largest.pullPercentage + drift),
    );
  }

  return out;
}

/**
 * Build the ordered array the slider component needs.
 * Non-savings funds first (preserving order), savings last.
 */
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

export default function FundsPage() {
  const router = useRouter();

  const [serverFunds, setServerFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);

  const [draftFunds, setDraftFunds] = useState<DraftFund[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);

  const [busy, setBusy] = useState(false);

  const sliderFunds = useMemo(() => buildSliderFunds(draftFunds), [draftFunds]);

  /** Display order: non-savings first, savings last. */
  const orderedDraft = useMemo(() => {
    const ns = draftFunds.filter((f) => !f.isSavings);
    const sv = draftFunds.filter((f) => f.isSavings);
    return [...ns, ...sv];
  }, [draftFunds]);

  /** Map each fund key → colour index (savings = -1). */
  const colorMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of orderedDraft) {
      map.set(f.key, f.isSavings ? -1 : keyToColorIndex(f.key));
    }
    return map;
  }, [orderedDraft]);

  /** Non-savings pull-% total from the server (for the "previously saved" card). */
  const serverNsTotal = useMemo(
    () =>
      serverFunds
        .filter((f) => !f.isSavings)
        .reduce((s, f) => s + (f.pullPercentage ?? 0), 0),
    [serverFunds],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const ready = await checkBootstrapOrRedirect(router);
      if (!ready) return;
      const res = await apiJson<{ funds: Fund[] }>("/api/funds");
      setServerFunds(res.funds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load funds");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Re-initialise draft from serverFunds. */
  const resetDraft = useCallback(() => {
    setDraftFunds(normaliseDraft(serverFunds.map(fundToDraft)));
    setDeletedIds([]);
    setDirty(false);
  }, [serverFunds]);

  useEffect(() => {
    resetDraft();
  }, [resetDraft]);

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
    resetDraft();
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
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <FundsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Funds</h1>
          {dirty && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {dirty ? (
            <Button variant="outline" onClick={revert} disabled={busy}>
              Revert
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={busy}
            >
              Refresh
            </Button>
          )}
          <Button
            onClick={() => void confirmChanges()}
            disabled={busy || !dirty}
          >
            Confirm
          </Button>
        </div>
      </div>

      {/* ── Allocation slider ───────────────────────────────────── */}
      {sliderFunds.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Income allocation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Set how each paycheck splits across your funds. Savings keeps
              whatever&apos;s left over, so your shares always add up to 100%.
            </p>
            <MultiFundSlider
              funds={sliderFunds}
              onChange={handleSliderChange}
              disabled={busy}
            />
            <p className="text-muted-foreground text-2xs">
              Drag a divider, or focus it and use the arrow keys (hold Shift for
              bigger steps). Nothing is saved until you press Confirm — Revert
              undoes every change.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Fund details ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Fund details</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={addFund}
              disabled={busy}
            >
              <Plus />
              Add fund
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-[48px]"></TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {orderedDraft.map((f) => {
                const ci = colorMap.get(f.key) ?? -1;
                const del = canDeleteFund(f);

                return (
                  <TableRow key={f.key}>
                    {/* Colour dot */}
                    <TableCell>
                      <Swatch
                        color={seriesColor(ci, f.isSavings).bg}
                        hatched={f.isSavings}
                        className="mx-auto"
                      />
                    </TableCell>

                    {/* Name */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={f.name}
                          onChange={(e) =>
                            updateDraft(f.key, { name: e.target.value })
                          }
                          placeholder="Fund name"
                          disabled={busy}
                          className="max-w-[200px]"
                        />
                        {!f.id && (
                          <span className="text-2xs rounded bg-blue-100 px-1.5 py-0.5 font-semibold tracking-wider text-blue-800 uppercase dark:bg-blue-900/30 dark:text-blue-200">
                            New
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Balance */}
                    <TableCell className="text-right tabular-nums">
                      {f.id ? (
                        <ClearedWithPending
                          cleared={f.balance}
                          withPending={f.balanceWithPending}
                        />
                      ) : (
                        "-"
                      )}
                    </TableCell>

                    {/* Delete */}
                    <TableCell>
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
                            <Trash2 />
                          </Button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0} className="inline-flex">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled
                                  aria-label={`Can't delete ${f.name || "fund"}: ${del.reason}`}
                                  className="text-muted-foreground pointer-events-none"
                                >
                                  <Trash2 />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{del.reason}</TooltipContent>
                          </Tooltip>
                        ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Previously saved ────────────────────────────────────── */}
      {dirty && serverFunds.length > 0 && (
        <Card className="border-dashed opacity-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Previously saved
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                    <span className="tabular-nums">{displayPct} income share</span>
                    <span className="opacity-40">·</span>
                    <span className="tabular-nums">
                      {fmtAmount(f.balance)} balance
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
