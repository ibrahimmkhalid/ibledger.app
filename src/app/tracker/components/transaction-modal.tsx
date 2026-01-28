"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { apiJson } from "@/app/tracker/lib/api";
import { fmtAmount, isoToday } from "@/app/tracker/lib/format";
import type { Fund, TransactionEvent, Wallet } from "@/app/tracker/types";

type Direction = "outflow" | "inflow";

type LineDraft = {
  key: string;
  walletId: string;
  fundId: string;
  description: string;
  direction: Direction;
  amount: string; // absolute
  isPending: boolean;
};

function parseDateToInputValue(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return isoToday();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeKey() {
  return String(Math.random()).slice(2);
}

function defaultLineDraft(args?: Partial<Omit<LineDraft, "key">>): LineDraft {
  return {
    key: makeKey(),
    walletId: args?.walletId ?? "",
    fundId: args?.fundId ?? "",
    description: args?.description ?? "",
    direction: args?.direction ?? "outflow",
    amount: args?.amount ?? "10",
    isPending: args?.isPending ?? true,
  };
}

export function TransactionModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  funds: Fund[];
  initialEvent?: TransactionEvent | null;
  onSaved?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}) {
  const {
    open,
    onOpenChange,
    wallets,
    funds,
    initialEvent,
    onSaved,
    onDeleted,
  } = args;

  const walletOptions = useMemo(
    () => wallets.map((w) => ({ id: w.id, name: w.name })),
    [wallets],
  );

  const fundOptions = useMemo(
    () => funds.filter((f) => f.kind !== "income"),
    [funds],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [occurredAt, setOccurredAt] = useState(isoToday());
  const [description, setDescription] = useState("Transaction");
  const [lines, setLines] = useState<LineDraft[]>([]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
      setEditing(false);
      return;
    }

    if (initialEvent) {
      setOccurredAt(parseDateToInputValue(initialEvent.occurredAt));
      setDescription(initialEvent.description ?? "Transaction");

      const eventLines =
        initialEvent.children.length > 0
          ? initialEvent.children
          : [
              {
                id: initialEvent.id,
                walletId: initialEvent.walletId,
                fundId: initialEvent.fundId,
                description: initialEvent.description,
                amount: initialEvent.amount,
                isPending: initialEvent.isPending,
                incomePull: initialEvent.incomePull,
              },
            ];

      setLines(
        eventLines.map((l) => {
          const n = Number(l.amount);
          const direction: Direction = n < 0 ? "outflow" : "inflow";
          const abs = Math.abs(n);
          return defaultLineDraft({
            walletId: l.walletId ? String(l.walletId) : "",
            fundId: l.fundId ? String(l.fundId) : "",
            description: l.description ?? "",
            direction,
            amount: abs ? String(abs) : "",
            isPending: Boolean(l.isPending),
          });
        }),
      );

      return;
    }

    const defaultWalletId = wallets[0]?.id;
    const preferredFundId =
      fundOptions.find((f) => f.kind === "regular")?.id ??
      fundOptions.find((f) => f.kind === "savings")?.id;

    setOccurredAt(isoToday());
    setDescription("Transaction");
    setLines([
      defaultLineDraft({
        walletId: defaultWalletId ? String(defaultWalletId) : "",
        fundId: preferredFundId ? String(preferredFundId) : "",
        direction: "outflow",
        amount: "10",
        isPending: true,
      }),
    ]);
  }, [open, initialEvent, wallets, fundOptions]);

  function parseLinesForApi() {
    const parsed = lines.map((l) => {
      const abs = Number(l.amount);
      if (Number.isNaN(abs) || abs <= 0) {
        throw new Error("Each line must have an amount > 0");
      }

      const walletId = l.walletId ? Number(l.walletId) : null;
      const fundId = l.fundId ? Number(l.fundId) : null;

      if (walletId === null && fundId === null) {
        throw new Error("Each line must include a wallet or a fund");
      }

      const signedAmount = l.direction === "outflow" ? -abs : abs;

      const description = l.description.trim() ? l.description.trim() : null;

      return {
        walletId,
        fundId,
        description,
        amount: signedAmount,
        isPending: Boolean(l.isPending),
      };
    });

    if (parsed.length === 0) {
      throw new Error("Add at least one line");
    }

    const eventIsPending = parsed.some((l) => l.isPending);

    return { lines: parsed, eventIsPending };
  }

  async function saveCreate() {
    setError(null);
    setBusy(true);

    try {
      const { lines: parsedLines, eventIsPending } = parseLinesForApi();

      await apiJson("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: "expense",
          occurredAt,
          description,
          isPending: eventIsPending,
          lines: parsedLines,
        }),
      });

      await onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!initialEvent) return;

    setError(null);
    setBusy(true);

    try {
      const { lines: parsedLines, eventIsPending } = parseLinesForApi();

      await apiJson(`/api/transactions/${initialEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          type: "expense",
          occurredAt,
          description,
          isPending: eventIsPending,
          lines: parsedLines,
        }),
      });

      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent() {
    if (!initialEvent) return;

    setError(null);
    setBusy(true);

    try {
      await apiJson(`/api/transactions/${initialEvent.id}`, {
        method: "DELETE",
      });
      await onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  const title = initialEvent ? "Transaction" : "Add transaction";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl sm:min-w-[56rem]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error && <div className="text-destructive text-sm">{error}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Date</div>
            <Input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={Boolean(initialEvent) && !editing}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Description</div>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              disabled={Boolean(initialEvent) && !editing}
            />
          </div>
        </div>

        {initialEvent && !editing ? (
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">Breakdown</div>
            <div className="text-muted-foreground text-xs">
              {initialEvent.children.length > 0
                ? `${initialEvent.children.length} lines`
                : "Single line"}
            </div>
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="w-[140px] text-right">
                      Amount
                    </TableHead>
                    <TableHead className="w-[110px]">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(initialEvent.children.length > 0
                    ? initialEvent.children
                    : [
                        {
                          id: initialEvent.id,
                          walletName: initialEvent.walletName,
                          fundName: initialEvent.fundName,
                          description: initialEvent.description,
                          amount: initialEvent.amount,
                          isPending: initialEvent.isPending,
                        },
                      ]
                  ).map((c) => {
                    const n = Number(c.amount);
                    const dir: Direction = n < 0 ? "outflow" : "inflow";
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.walletName ?? ""}</TableCell>
                        <TableCell>{c.fundName ?? ""}</TableCell>
                        <TableCell>{c.description ?? ""}</TableCell>
                        <TableCell className="capitalize">{dir}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={n < 0 ? "text-destructive" : ""}>
                            {fmtAmount(Math.abs(n))}
                          </span>
                        </TableCell>
                        <TableCell>
                          {Boolean(c.isPending) ? "yes" : "no"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Lines</div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setLines((prev) => [...prev, defaultLineDraft()])
                }
                disabled={busy}
              >
                Add line
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[150px]">Direction</TableHead>
                  <TableHead className="w-[140px] text-right">Amount</TableHead>
                  <TableHead className="w-[120px]">Pending</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell>
                      <select
                        className="bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full min-w-0 rounded-md border px-2 py-1 text-sm outline-none"
                        value={l.walletId}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, walletId: e.target.value }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">—</option>
                        {walletOptions.map((w) => (
                          <option key={w.id} value={String(w.id)}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <select
                        className="bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full min-w-0 rounded-md border px-2 py-1 text-sm outline-none"
                        value={l.fundId}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, fundId: e.target.value }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">—</option>
                        {fundOptions.map((f) => (
                          <option key={f.id} value={String(f.id)}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.description}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="(optional)"
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        className="bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full min-w-0 rounded-md border px-2 py-1 text-sm outline-none"
                        value={l.direction}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? {
                                    ...x,
                                    direction: e.target.value as Direction,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="outflow">Outflow</option>
                        <option value="inflow">Inflow</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Input
                        inputMode="decimal"
                        value={l.amount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, amount: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="10"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Switch
                          checked={l.isPending}
                          onCheckedChange={(checked) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.key === l.key
                                  ? { ...x, isPending: checked }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((x) => x.key !== l.key),
                          )
                        }
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {initialEvent && (
              <Button
                type="button"
                variant="destructive"
                onClick={deleteEvent}
                disabled={busy}
              >
                Delete
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {initialEvent && !editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
            {initialEvent && editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}

            {!initialEvent && (
              <Button type="button" onClick={saveCreate} disabled={busy}>
                Save
              </Button>
            )}
            {initialEvent && editing && (
              <Button type="button" onClick={saveEdit} disabled={busy}>
                Save changes
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
