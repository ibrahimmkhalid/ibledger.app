"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AmountInput } from "@/app/tracker/components/amount-input";
import { useConfirm } from "@/app/tracker/components/confirm-dialog";
import { UnavailableActionButton } from "@/app/tracker/components/unavailable-action-button";
import { apiJson } from "@/app/tracker/lib/api";
import { useBusy } from "@/app/tracker/components/use-busy";
import {
  fmtAmount,
  isoToday,
  toDateInputValue,
} from "@/app/tracker/lib/format";
import { cn } from "@/lib/utils";
import type { Fund, TransactionEvent, Wallet } from "@/app/tracker/types";

import { Trash2Icon } from "lucide-react";

type Direction = "out" | "in";

type LineDraft = {
  key: string;
  transactionId: number | null;
  walletId: string;
  fundId: string;
  description: string;
  direction: Direction;
  amount: string; // absolute
  isPending: boolean;
};

function makeKey() {
  return String(Math.random()).slice(2);
}

function defaultLineDraft(args?: Partial<Omit<LineDraft, "key">>): LineDraft {
  return {
    key: makeKey(),
    transactionId: args?.transactionId ?? null,
    walletId: args?.walletId ?? "",
    fundId: args?.fundId ?? "",
    description: args?.description ?? "",
    direction: args?.direction ?? "out",
    amount: args?.amount ?? "",
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

  const { busy, error, setBusy, setError, runWithBusy } = useBusy();
  const { confirm, confirmDialog } = useConfirm();
  const [editing, setEditing] = useState(false);

  const [occurredAt, setOccurredAt] = useState(isoToday());
  const [description, setDescription] = useState("");
  const dateId = useId();
  const descriptionId = useId();
  const [lines, setLines] = useState<LineDraft[]>([]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setDescription("");
      setBusy(false);
      setEditing(false);
      return;
    }

    if (initialEvent) {
      setOccurredAt(toDateInputValue(initialEvent.occurredAt));
      setDescription(initialEvent.description ?? "");

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
          const direction: Direction = n < 0 ? "out" : "in";
          const abs = Math.abs(n);
          return defaultLineDraft({
            transactionId: l.id,
            walletId: l.walletId ? String(l.walletId) : "",
            fundId: l.fundId ? String(l.fundId) : "",
            description: l.description ?? "",
            direction,
            amount: abs ? String(Math.round(abs * 100)) : "",
            isPending: Boolean(l.isPending),
          });
        }),
      );

      return;
    }

    const defaultWalletId = wallets[0]?.id;
    const preferredFundId =
      funds.find((f) => !f.isSavings)?.id ?? funds.find((f) => f.isSavings)?.id;

    setOccurredAt(isoToday());
    setLines([
      defaultLineDraft({
        walletId: defaultWalletId ? String(defaultWalletId) : "",
        fundId: preferredFundId ? String(preferredFundId) : "",
        direction: "out",
        amount: "",
        isPending: true,
      }),
    ]);
  }, [open, initialEvent, wallets, funds, setBusy, setError]);

  function patchLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function addLine() {
    setLines((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        defaultLineDraft({
          walletId: last?.walletId ?? "",
          fundId: last?.fundId ?? "",
          direction: last?.direction ?? "out",
          isPending: last?.isPending ?? true,
        }),
      ];
    });
  }

  function parseLinesForApi() {
    const parsed = lines.map((l) => {
      const abs = Number(l.amount) / 100;
      if (Number.isNaN(abs) || abs <= 0) {
        throw new Error("Every line needs an amount above $0");
      }

      const walletId = l.walletId ? Number(l.walletId) : null;
      const fundId = l.fundId ? Number(l.fundId) : null;
      const transactionId = l.transactionId ? Number(l.transactionId) : null;

      if (walletId === null || fundId === null) {
        throw new Error("Every line needs a wallet and a fund");
      }

      const signedAmount = l.direction === "out" ? -abs : abs;

      const description = l.description.trim() ? l.description.trim() : null;

      return {
        transactionId,
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
    await runWithBusy(async () => {
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
    }, "Failed to save");
  }

  async function saveEdit() {
    if (!initialEvent) return;

    await runWithBusy(async () => {
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
    }, "Failed to save");
  }

  async function deleteEvent() {
    if (!initialEvent) return;

    const ok = await confirm({
      title: "Delete this transaction?",
      description: "This can't be undone.",
      confirmLabel: "Delete transaction",
      destructive: true,
    });
    if (!ok) return;

    await runWithBusy(async () => {
      await apiJson(`/api/transactions/${initialEvent.id}`, {
        method: "DELETE",
      });
      await onDeleted?.();
    }, "Failed to delete");
  }

  const title = initialEvent ? "Transaction details" : "Add transaction";

  const readOnly = Boolean(initialEvent) && !editing;

  const breakdown =
    initialEvent && initialEvent.children.length > 0
      ? initialEvent.children
      : initialEvent
        ? [
            {
              id: initialEvent.id,
              walletName: initialEvent.walletName,
              fundName: initialEvent.fundName,
              description: initialEvent.description,
              amount: initialEvent.amount,
              isPending: initialEvent.isPending,
            },
          ]
        : [];

  // What the transaction adds up to: "out" lines count against "in" ones, so a
  // several-line entry has a single net figure the user can check as they type.
  const draftTotal = lines.reduce((acc, line) => {
    const abs = Number(line.amount) / 100;
    if (!Number.isFinite(abs)) return acc;
    return acc + (line.direction === "out" ? -abs : abs);
  }, 0);

  const breakdownTotal = breakdown.reduce(
    (acc, child) => acc + Number(child.amount),
    0,
  );

  const removeLineReason =
    lines.length <= 1 ? "A transaction needs at least one line" : null;

  function renderTotalRow(label: string, total: number) {
    return (
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-2">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            total < 0 && "text-destructive",
          )}
        >
          {fmtAmount(total)}
        </span>
      </div>
    );
  }

  function renderBreakdown(isMobile: boolean) {
    if (!initialEvent || editing) return null;

    const subtitle =
      initialEvent.children.length > 0
        ? `${initialEvent.children.length} lines`
        : "Single line";

    if (isMobile) {
      return (
        <div className="mt-4 rounded-md border p-3">
          <div className="text-sm font-medium">Breakdown</div>
          <div className="text-muted-foreground text-xs">{subtitle}</div>
          <div className="mt-3 flex flex-col gap-2">
            {breakdown.map((c) => {
              const n = Number(c.amount);
              const dir: Direction = n < 0 ? "out" : "in";
              const wallet = c.walletName ?? "";
              const fund = c.fundName ?? "";
              const titleLine =
                wallet && fund
                  ? `${wallet} · ${fund}`
                  : wallet || fund || "(unassigned)";
              return (
                <div key={c.id} className="rounded-md border px-2 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {titleLine}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {c.description ?? ""}
                      </div>
                      <div className="text-muted-foreground mt-1 text-[11px] capitalize">
                        {dir}
                        {c.isPending ? " - pending" : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <span className={n < 0 ? "text-destructive" : ""}>
                        {fmtAmount(Math.abs(n))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {renderTotalRow("Net total", breakdownTotal)}
        </div>
      );
    }

    return (
      <div className="rounded-md border p-3">
        <div className="text-sm font-medium">Breakdown</div>
        <div className="text-muted-foreground text-xs">{subtitle}</div>
        <div className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-2/12 min-w-0">Wallet</TableHead>
                <TableHead className="w-2/12 min-w-0">Fund</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-1/12 min-w-0">Direction</TableHead>
                <TableHead className="w-2/12 min-w-0 text-right">
                  Amount
                </TableHead>
                <TableHead className="w-1/24 min-w-0">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((c) => {
                const n = Number(c.amount);
                const dir: Direction = n < 0 ? "out" : "in";
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
                    <TableCell>{c.isPending ? "Yes" : "No"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {renderTotalRow("Net total", breakdownTotal)}
      </div>
    );
  }

  function renderLinesEditor(isMobile: boolean) {
    if (initialEvent && !editing) return null;

    if (isMobile) {
      return (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Lines</div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              disabled={busy}
            >
              Add line
            </Button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {lines.map((l, index) => (
              <div key={l.key} className="rounded-md border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={l.walletId}
                    onValueChange={(value) =>
                      patchLine(l.key, {
                        walletId: value == null ? "" : String(value),
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Wallet for line ${index + 1}`}
                      className="w-full min-w-0"
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={l.fundId}
                    onValueChange={(value) =>
                      patchLine(l.key, {
                        fundId: value == null ? "" : String(value),
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Fund for line ${index + 1}`}
                      className="w-full min-w-0"
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {funds.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-2">
                  <Input
                    value={l.description}
                    onChange={(e) =>
                      patchLine(l.key, { description: e.target.value })
                    }
                    aria-label={`Description for line ${index + 1}`}
                    placeholder="Description (optional)"
                    disabled={busy}
                  />
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Select
                    value={l.direction}
                    onValueChange={(value) => {
                      const dir: Direction = value === "in" ? "in" : "out";
                      patchLine(l.key, { direction: dir });
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Direction for line ${index + 1}`}
                      className="w-full min-w-0 capitalize"
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="out">Out</SelectItem>
                      <SelectItem value="in">In</SelectItem>
                    </SelectContent>
                  </Select>

                  <AmountInput
                    aria-label={`Amount for line ${index + 1}`}
                    value={l.amount}
                    onValueChange={(amount) => patchLine(l.key, { amount })}
                    placeholder="$0.00"
                    disabled={busy}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-muted-foreground text-xs">Pending</div>
                    <Switch
                      checked={l.isPending}
                      onCheckedChange={(checked) =>
                        patchLine(l.key, { isPending: checked })
                      }
                      aria-label={`Pending for line ${index + 1}`}
                      disabled={busy}
                    />
                  </div>

                  {removeLineReason ? (
                    <UnavailableActionButton
                      variant="outline"
                      size="sm"
                      label={`Can't remove line ${index + 1}`}
                      reason={removeLineReason}
                    >
                      <Trash2Icon />
                    </UnavailableActionButton>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLine(l.key)}
                      aria-label={`Remove line ${index + 1}`}
                      disabled={busy}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {renderTotalRow("Net total", draftTotal)}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">Lines</div>
          <Button
            type="button"
            variant="outline"
            onClick={addLine}
            disabled={busy}
          >
            Add line
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/12 min-w-0">Wallet</TableHead>
              <TableHead className="w-2/12 min-w-0">Fund</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-1/12 min-w-0">Direction</TableHead>
              <TableHead className="w-2/12 min-w-0">Amount</TableHead>
              <TableHead className="w-1/24 min-w-0">Pending</TableHead>
              <TableHead className="w-1/24 min-w-0"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, index) => (
              <TableRow key={l.key}>
                <TableCell>
                  <Select
                    value={l.walletId}
                    onValueChange={(value) =>
                      patchLine(l.key, {
                        walletId: value == null ? "" : String(value),
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Wallet for line ${index + 1}`}
                      className="w-full min-w-0"
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={l.fundId}
                    onValueChange={(value) =>
                      patchLine(l.key, {
                        fundId: value == null ? "" : String(value),
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Fund for line ${index + 1}`}
                      className="w-full min-w-0"
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {funds.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    value={l.description}
                    onChange={(e) =>
                      patchLine(l.key, { description: e.target.value })
                    }
                    aria-label={`Description for line ${index + 1}`}
                    placeholder="(optional)"
                    disabled={busy}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={l.direction}
                    onValueChange={(value) => {
                      const dir: Direction = value === "in" ? "in" : "out";
                      patchLine(l.key, { direction: dir });
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Direction for line ${index + 1}`}
                      className="w-full min-w-0 capitalize"
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="out">Out</SelectItem>
                      <SelectItem value="in">In</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <AmountInput
                    aria-label={`Amount for line ${index + 1}`}
                    value={l.amount}
                    onValueChange={(amount) => patchLine(l.key, { amount })}
                    placeholder="$0.00"
                    disabled={busy}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center">
                    <Switch
                      checked={l.isPending}
                      onCheckedChange={(checked) =>
                        patchLine(l.key, { isPending: checked })
                      }
                      aria-label={`Pending for line ${index + 1}`}
                      disabled={busy}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {removeLineReason ? (
                    <UnavailableActionButton
                      variant="outline"
                      size="default"
                      label={`Can't remove line ${index + 1}`}
                      reason={removeLineReason}
                    >
                      <Trash2Icon />
                    </UnavailableActionButton>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeLine(l.key)}
                      aria-label={`Remove line ${index + 1}`}
                      disabled={busy}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {renderTotalRow("Net total", draftTotal)}
      </div>
    );
  }

  return (
    <>
      {confirmDialog}
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        desktopContentClassName="sm:max-w-[min(56rem,calc(100vw-2rem))]"
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
                <Label htmlFor={dateId}>Date</Label>
                <Input
                  id={dateId}
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={descriptionId}>Description</Label>
                <Input
                  id={descriptionId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Grocery run"
                  disabled={readOnly}
                />
              </div>
            </div>
            {renderBreakdown(isMobile)}
            {renderLinesEditor(isMobile)}
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
    </>
  );
}
