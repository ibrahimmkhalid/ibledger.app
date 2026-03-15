"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import type { Fund, TransactionEvent, Wallet } from "@/app/tracker/types";

import { TrashIcon } from "lucide-react";

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

  const walletOptions = useMemo(
    () => wallets.map((w) => ({ id: w.id, name: w.name })),
    [wallets],
  );

  const fundOptions = useMemo(() => funds, [funds]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [occurredAt, setOccurredAt] = useState(isoToday());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

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
      fundOptions.find((f) => !f.isSavings)?.id ??
      fundOptions.find((f) => f.isSavings)?.id;

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
  }, [open, initialEvent, wallets, fundOptions]);

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
        throw new Error("Each line must have an amount > 0");
      }

      const walletId = l.walletId ? Number(l.walletId) : null;
      const fundId = l.fundId ? Number(l.fundId) : null;
      const transactionId = l.transactionId ? Number(l.transactionId) : null;

      if (walletId === null || fundId === null) {
        throw new Error("Each line must include a wallet and a fund.");
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
                    <TableCell>{Boolean(c.isPending) ? "yes" : "no"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
            {lines.map((l) => (
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
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletOptions.map((w) => (
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
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {fundOptions.map((f) => (
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
                    <SelectTrigger className="w-full min-w-0 capitalize">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="out">Out</SelectItem>
                      <SelectItem value="in">In</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    inputMode="numeric"
                    value={formatCentsToDisplay(l.amount)}
                    onChange={(e) =>
                      patchLine(l.key, {
                        amount: parseInputAsCents(e.target.value),
                      })
                    }
                    placeholder="$0.00"
                    className="text-right tabular-nums"
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
                      disabled={busy}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeLine(l.key)}
                    disabled={busy}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
            {lines.map((l) => (
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
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletOptions.map((w) => (
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
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {fundOptions.map((f) => (
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
                    <SelectTrigger className="w-full min-w-0 capitalize">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="out">Out</SelectItem>
                      <SelectItem value="in">In</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Input
                    inputMode="numeric"
                    value={formatCentsToDisplay(l.amount)}
                    onChange={(e) =>
                      patchLine(l.key, {
                        amount: parseInputAsCents(e.target.value),
                      })
                    }
                    placeholder="$0.00"
                    className="text-right tabular-nums"
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
                      disabled={busy}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeLine(l.key)}
                    disabled={busy}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desktopContentClassName="sm:max-w-5xl sm:min-w-[56rem]"
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
  );
}
