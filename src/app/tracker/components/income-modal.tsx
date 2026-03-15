"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EventModalActions } from "@/app/tracker/components/event-modal-actions";
import { ResponsiveModal } from "@/app/tracker/components/responsive-modal";
import { apiJson } from "@/app/tracker/lib/api";
import {
  formatCentsToDisplay,
  parseInputAsCents,
} from "@/app/tracker/lib/cents";
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
  const [description, setDescription] = useState("");
  const [walletId, setWalletId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
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
      setDescription(initialEvent.description ?? "");
      setIsPending(Boolean(initialEvent.isPending));

      const inferredWalletId =
        initialEvent.children.find((c) => c.walletId)?.walletId ??
        initialEvent.walletId;

      setWalletId(inferredWalletId ? String(inferredWalletId) : "");
      setAmount(String(Math.round(sumIncomeAmount(initialEvent) * 100)));
      return;
    }

    const defaultWalletId = wallets[0]?.id;
    setOccurredAt(isoToday());
    setWalletId(defaultWalletId ? String(defaultWalletId) : "");
    setAmount("");
    setIsPending(true);
  }, [open, initialEvent, wallets]);

  const readOnly = Boolean(initialEvent) && !editing;

  function parseDraftForApi() {
    const wid = Number(walletId);
    const amt = Number(amount) / 100;
    if (!wid || Number.isNaN(wid)) throw new Error("Select a wallet");
    if (!amt || Number.isNaN(amt) || amt <= 0) {
      throw new Error("Amount must be > 0");
    }
    return {
      type: "income" as const,
      occurredAt,
      description,
      walletId: wid,
      amount: amt,
      isPending,
    };
  }

  async function runWithBusy(op: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await op();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function saveCreate() {
    await runWithBusy(async () => {
      await apiJson("/api/transactions", {
        method: "POST",
        body: JSON.stringify(parseDraftForApi()),
      });
      await onSaved?.();
      onOpenChange(false);
    }, "Failed to save");
  }

  async function saveEdit() {
    if (!initialEvent) return;
    await runWithBusy(async () => {
      await apiJson(`/api/transactions/${initialEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify(parseDraftForApi()),
      });
      await onSaved?.();
    }, "Failed to save");
  }

  async function deleteEvent() {
    if (!initialEvent) return;
    await runWithBusy(async () => {
      await apiJson(`/api/transactions/${initialEvent.id}`, {
        method: "DELETE",
      });
      await onDeleted?.();
    }, "Failed to delete");
  }

  const title = initialEvent ? "Income" : "Add income";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desktopContentClassName="sm:max-w-2xl sm:min-w-[40rem]"
      desktopFooterClassName="flex items-center justify-between gap-2"
      renderBody={({ isMobile }) => (
        <>
          {error && <div className="text-destructive text-sm">{error}</div>}

          <div
            className={
              isMobile ? "mt-3 grid gap-3" : "grid gap-4 md:grid-cols-2"
            }
          >
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">Date</div>
              <Input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">Description</div>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                disabled={readOnly}
              />
            </div>
          </div>

          <div
            className={
              isMobile ? "mt-3 grid gap-3" : "grid gap-4 md:grid-cols-2"
            }
          >
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">Wallet</div>
              <Select
                value={walletId}
                onValueChange={(value) =>
                  setWalletId(value == null ? "" : String(value))
                }
                disabled={readOnly}
              >
                <SelectTrigger className={isMobile ? "" : "w-full min-w-0"}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {walletOptions.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">Amount</div>
              <Input
                inputMode="numeric"
                value={formatCentsToDisplay(amount)}
                onChange={(e) => setAmount(parseInputAsCents(e.target.value))}
                disabled={readOnly}
                placeholder="$0.00"
              />
            </div>
          </div>

          <div
            className={
              isMobile
                ? "mt-3 flex items-center justify-between rounded-md border px-3 py-2"
                : "flex items-center justify-between rounded-md border px-3 py-2"
            }
          >
            <div className="flex flex-col">
              <div className="text-sm font-medium">Pending</div>
              <div className="text-muted-foreground text-xs">
                Controls whether this income counts in cleared totals
              </div>
            </div>
            <Switch
              checked={isPending}
              onCheckedChange={setIsPending}
              disabled={readOnly}
            />
          </div>

          {initialEvent && !editing && (
            <div
              className={
                isMobile
                  ? "mt-4 rounded-md border p-3"
                  : "rounded-md border p-3"
              }
            >
              <div className="text-sm font-medium">Breakdown</div>
              <div className="text-muted-foreground text-xs">
                Auto-allocated by pulls
              </div>

              {isMobile ? (
                <div className="mt-3 flex flex-col gap-2">
                  {initialEvent.children.map((c) => (
                    <div key={c.id} className="rounded-md border px-2 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {c.fundName ?? "(fund)"}
                          </div>
                          <div className="text-muted-foreground mt-1 text-[11px]">
                            {c.incomePull === null
                              ? ""
                              : `Pull ${c.incomePull}%`}
                            {c.isPending
                              ? c.incomePull === null
                                ? "Pending"
                                : " · Pending"
                              : ""}
                          </div>
                        </div>
                        <div className="text-right text-sm tabular-nums">
                          {fmtAmount(Number(c.amount))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
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
              )}
            </div>
          )}
        </>
      )}
      renderFooter={() => (
        <EventModalActions
          hasInitialEvent={Boolean(initialEvent)}
          editing={editing}
          busy={busy}
          onDelete={deleteEvent}
          onStartEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onCreate={saveCreate}
          onSaveEdit={saveEdit}
        />
      )}
    />
  );
}
