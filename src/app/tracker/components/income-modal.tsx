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
import {
  fmtAmount,
  isoToday,
  toDateInputValue,
} from "@/app/tracker/lib/format";
import type { TransactionEvent, Wallet } from "@/app/tracker/types";

function sumIncomeAmount(ev: TransactionEvent) {
  if (ev.children.length > 0) {
    return ev.children.reduce((acc, c) => acc + Number(c.amount), 0);
  }
  return Number(ev.amount);
}

export function IncomeModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  initialEvent?: TransactionEvent | null;
  onSaved?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}) {
  const { open, onOpenChange, wallets, initialEvent, onSaved, onDeleted } =
    args;

  const walletOptions = useMemo(
    () => wallets.map((w) => ({ id: w.id, name: w.name })),
    [wallets],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [occurredAt, setOccurredAt] = useState(isoToday());
  const [description, setDescription] = useState("Income");
  const [walletId, setWalletId] = useState<string>("");
  const [amount, setAmount] = useState<string>("10");
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
      setEditing(false);
      return;
    }

    if (initialEvent) {
      setOccurredAt(toDateInputValue(initialEvent.occurredAt));
      setDescription(initialEvent.description ?? "Income");
      setIsPending(Boolean(initialEvent.isPending));

      const inferredWalletId =
        initialEvent.children.find((c) => c.walletId)?.walletId ??
        initialEvent.walletId;

      setWalletId(inferredWalletId ? String(inferredWalletId) : "");
      setAmount(String(sumIncomeAmount(initialEvent) || 0));
      return;
    }

    const defaultWalletId = wallets[0]?.id;
    setOccurredAt(isoToday());
    setDescription("Income");
    setWalletId(defaultWalletId ? String(defaultWalletId) : "");
    setAmount("10");
    setIsPending(true);
  }, [open, initialEvent, wallets]);

  async function saveCreate() {
    setError(null);
    setBusy(true);

    try {
      const wid = Number(walletId);
      const amt = Number(amount);
      if (!wid || Number.isNaN(wid)) throw new Error("Select a wallet");
      if (!amt || Number.isNaN(amt) || amt <= 0) {
        throw new Error("Amount must be > 0");
      }

      await apiJson("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: "income",
          occurredAt,
          description,
          walletId: wid,
          amount: amt,
          isPending,
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
      const wid = Number(walletId);
      const amt = Number(amount);
      if (!wid || Number.isNaN(wid)) throw new Error("Select a wallet");
      if (!amt || Number.isNaN(amt) || amt <= 0) {
        throw new Error("Amount must be > 0");
      }

      await apiJson(`/api/transactions/${initialEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          type: "income",
          occurredAt,
          description,
          walletId: wid,
          amount: amt,
          isPending,
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

  const title = initialEvent ? "Income" : "Add income";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:min-w-[40rem]">
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Wallet</div>
            <select
              className="bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full min-w-0 rounded-md border px-2 py-1 text-sm outline-none"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              disabled={Boolean(initialEvent) && !editing}
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
            <div className="text-muted-foreground text-xs">Amount</div>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={Boolean(initialEvent) && !editing}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="flex flex-col">
            <div className="text-sm font-medium">Pending</div>
            <div className="text-muted-foreground text-xs">
              Controls whether this income counts in cleared totals
            </div>
          </div>
          <Switch
            checked={isPending}
            onCheckedChange={setIsPending}
            disabled={Boolean(initialEvent) && !editing}
          />
        </div>

        {initialEvent && !editing && (
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">Breakdown</div>
            <div className="text-muted-foreground text-xs">
              Auto-allocated by pulls
            </div>
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead className="w-[110px]">Pull</TableHead>
                    <TableHead className="w-[140px] text-right">
                      Amount
                    </TableHead>
                    <TableHead className="w-[110px]">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialEvent.children.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.fundName ?? ""}</TableCell>
                      <TableCell className="tabular-nums">
                        {c.incomePull === null ? "" : `${c.incomePull}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtAmount(Number(c.amount))}
                      </TableCell>
                      <TableCell>{c.isPending ? "yes" : "no"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
