"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
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
import { fmtAmount } from "@/app/tracker/lib/format";
import type { BootstrapResponse, Fund } from "@/app/tracker/types";
import {
  MultiFundSlider,
  type SliderFund,
  keyToColorIndex,
  segmentColor,
} from "@/components/ui/multi-fund-slider";

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */

type DraftFund = {
  key: string;
  id?: number;
  name: string;
  openingAmount: string;
  pullPercentage: number;
  isSavings: boolean;
  balance: number;
  balanceWithPending: number;
  rawBalance?: number;
  rawBalanceWithPending?: number;
};

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

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
    openingAmount: String(f.openingAmount),
    pullPercentage: f.pullPercentage,
    isSavings: f.isSavings,
    balance: f.balance,
    balanceWithPending: f.balanceWithPending,
    rawBalance: f.rawBalance,
    rawBalanceWithPending: f.rawBalanceWithPending,
  };
}

/**
 * Normalise non-savings pull-percentages so they sum to ≤ 99
 * (keeping at least 1 % for the savings segment on the slider).
 *
 * A3: reserve 1 % per fund as a guaranteed base before distributing the
 *     remaining pool (99 − count) proportionally.  This eliminates the
 *     post-hoc min‑1 % enforcement that could push the total past 99.
 * A4: the last fund is clamped to what's left — it can never overshoot.
 */
function normaliseDraft(drafts: DraftFund[]): DraftFund[] {
  const out = drafts.map((d) => ({ ...d }));
  const nonSavings = out.filter((f) => !f.isSavings);
  if (nonSavings.length === 0) return out;

  const count = nonSavings.length;
  const MAX = 99;
  const POOL = MAX - count; // remaining after 1 % per fund

  const total = nonSavings.reduce((s, f) => s + f.pullPercentage, 0);

  // Nothing allocated → distribute the pool equally.
  if (total === 0) {
    const share = roundHalf(POOL / count);
    let allocated = 0;
    nonSavings.forEach((f, i) => {
      const variable = i === count - 1 ? roundHalf(POOL - allocated) : share;
      allocated += variable;
      f.pullPercentage = 1 + Math.max(0, variable);
    });
    return out;
  }

  // Total exceeds 99 → scale the variable portion so it fits in the pool.
  if (total > MAX) {
    const scale = POOL / total;
    let varAllocated = 0;
    nonSavings.forEach((f, i) => {
      if (i === count - 1) {
        // A4: last fund takes what's left — guaranteed no overshoot.
        f.pullPercentage = 1 + Math.max(0, roundHalf(POOL - varAllocated));
      } else {
        const variable = roundHalf(f.pullPercentage * scale);
        varAllocated += variable;
        f.pullPercentage = 1 + variable;
      }
    });
    return out;
  }

  // Total ≤ 99: just bump below‑1 funds up to the minimum.
  // No risk of overflow since the worst case (all 0 → all 1) sums to ≤ 99.
  nonSavings.forEach((f) => {
    if (f.pullPercentage < 1) f.pullPercentage = 1;
  });

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
  if (d.isSavings) return { ok: false, reason: "Cannot delete savings fund" };
  if (!d.id) return { ok: true };
  const raw = Number(d.rawBalanceWithPending ?? d.balanceWithPending);
  if (Number.isFinite(raw) && Math.abs(raw) >= 0.005) {
    return {
      ok: false,
      reason: "Non-zero balance (including pending). Move money out first.",
    };
  }
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */

export default function FundsPage() {
  const router = useRouter();

  // ── server state ─────────────────────────────────────────────────
  const [serverFunds, setServerFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);

  // ── draft state ──────────────────────────────────────────────────
  const [draftFunds, setDraftFunds] = useState<DraftFund[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);

  // ── ui state ─────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── derived ──────────────────────────────────────────────────────
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

  // ── data loading ─────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const boot = await apiJson<BootstrapResponse>("/api/bootstrap", {
        method: "POST",
        body: "{}",
      });
      if (boot.onboarding?.required) {
        router.replace(boot.onboarding.redirectTo);
        return;
      }
      const res = await apiJson<{ funds: Fund[] }>("/api/funds");
      setServerFunds(res.funds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load funds");
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

  // ── draft mutations ──────────────────────────────────────────────

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
    setDraftFunds((prev) => {
      const nonSavings = prev.filter((f) => !f.isSavings);
      const nsTotal = nonSavings.reduce((s, f) => s + f.pullPercentage, 0);
      const savingsWouldBe = 100 - nsTotal - 1;

      let updated = [...prev];

      // If savings would drop below 1 %, steal 1 % from the largest fund.
      if (savingsWouldBe < 1 && nonSavings.length > 0) {
        const sorted = [...nonSavings].sort(
          (a, b) => b.pullPercentage - a.pullPercentage,
        );
        const largest = sorted[0];
        if (largest && largest.pullPercentage > 1) {
          updated = updated.map((f) =>
            f.key === largest.key
              ? { ...f, pullPercentage: f.pullPercentage - 1 }
              : f,
          );
        }
      }

      return [
        ...updated,
        {
          key: crypto.randomUUID(),
          name: "",
          openingAmount: "0",
          pullPercentage: 1,
          isSavings: false,
          balance: 0,
          balanceWithPending: 0,
        },
      ];
    });
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
    setError(null);
    setNotice(null);
  }

  // ── save ─────────────────────────────────────────────────────────

  async function confirmChanges() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const f of draftFunds) {
        if (!f.name.trim()) throw new Error("All funds must have a name");
        if (Number.isNaN(Number(f.openingAmount)))
          throw new Error(`Invalid opening amount for "${f.name}"`);
      }

      await apiJson("/api/funds/sync", {
        method: "PUT",
        body: JSON.stringify({
          funds: draftFunds.map((f) => ({
            id: f.id,
            name: f.name.trim(),
            openingAmount: Number(f.openingAmount),
            pullPercentage: f.isSavings ? 0 : f.pullPercentage,
          })),
          deletedIds,
        }),
      });

      setNotice("Changes saved");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading…</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Loading funds.
        </CardContent>
      </Card>
    );
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

      {/* ── Feedback ────────────────────────────────────────────── */}
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

      {/* ── Allocation slider ───────────────────────────────────── */}
      {sliderFunds.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Income Allocation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Decide what percentage of your income should go to each fund.
            </p>
            <MultiFundSlider
              funds={sliderFunds}
              onChange={handleSliderChange}
              disabled={busy}
            />
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
              <Plus className="mr-1 h-4 w-4" />
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
                <TableHead className="w-[150px]">Opening amount</TableHead>
                <TableHead className="w-[120px] text-right">Balance</TableHead>
                <TableHead className="w-[140px] text-right">
                  w/ Pending
                </TableHead>
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
                      <div
                        className={cn(
                          "mx-auto h-4 w-4 rounded-sm",
                          segmentColor(ci, f.isSavings),
                        )}
                        style={
                          f.isSavings
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(-45deg,transparent,transparent 2px,rgba(255,255,255,.3) 2px,rgba(255,255,255,.3) 4px)",
                              }
                            : undefined
                        }
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
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-blue-800 uppercase dark:bg-blue-900/30 dark:text-blue-200">
                            New
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Opening amount */}
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        value={f.openingAmount}
                        onChange={(e) =>
                          updateDraft(f.key, {
                            openingAmount: e.target.value,
                          })
                        }
                        disabled={busy}
                      />
                    </TableCell>

                    {/* Balance */}
                    <TableCell className="text-right tabular-nums">
                      {f.id ? fmtAmount(f.balance) : "-"}
                    </TableCell>

                    {/* Balance w/ pending */}
                    <TableCell className="text-right tabular-nums">
                      {f.id ? fmtAmount(f.balanceWithPending) : "-"}
                    </TableCell>

                    {/* Delete */}
                    <TableCell>
                      {!f.isSavings && (
                        <span title={del.reason}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFund(f.key)}
                            disabled={busy || !del.ok}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </span>
                      )}
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
                    <span className="tabular-nums">{displayPct} pull</span>
                    <span className="opacity-40">·</span>
                    <span className="tabular-nums">
                      {fmtAmount(f.openingAmount)} opening
                    </span>
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
