"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { apiJson } from "@/app/tracker/lib/api";
import {
  fmtAmount,
  isoToday,
  toDateInputValue,
} from "@/app/tracker/lib/format";
import type { Fund, TransactionEvent, Wallet } from "@/app/tracker/types";

import { useIsMobile } from "@/hooks/use-mobile";
import { TrashIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

function formatCentsToDisplay(cents: number | string): string {
  const n = typeof cents === "string" ? Number(cents) || 0 : cents;
  if (!n && n !== 0) return "$0.00";
  return `$${(n / 100).toFixed(2)}`;
}

function parseInputAsCents(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return String(Number(cleaned));
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

  const isMobile = useIsMobile();

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

  function getWalletNameById(id: string) {
    const wallet = wallets.find((w) => w.id === Number(id));
    return wallet?.name ?? "";
  }

  function getFundNameById(id: string) {
    const fund = funds.find((f) => f.id === Number(id));
    return fund?.name ?? "";
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

  if (isMobile) {
    const disabled = Boolean(initialEvent) && !editing;

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

    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[92vh]">
          <div className="flex max-h-[92vh] flex-col overflow-y-auto">
            <DrawerHeader className="p-3 pb-2">
              <div className="flex items-start justify-between gap-2">
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerClose
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  )}
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {error && <div className="text-destructive text-sm">{error}</div>}

              <div className="mt-3 grid gap-3">
                <div className="flex flex-col gap-2">
                  <div className="text-muted-foreground text-xs">Date</div>
                  <Input
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-muted-foreground text-xs">
                    Description
                  </div>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description"
                    disabled={disabled}
                  />
                </div>
              </div>

              {initialEvent && !editing ? (
                <div className="mt-4 rounded-md border p-3">
                  <div className="text-sm font-medium">Breakdown</div>
                  <div className="text-muted-foreground text-xs">
                    {initialEvent.children.length > 0
                      ? `${initialEvent.children.length} lines`
                      : "Single line"}
                  </div>
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
              ) : (
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
                            value={getWalletNameById(l.walletId) || ""}
                            onValueChange={(value) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === l.key
                                    ? { ...x, walletId: value || "" }
                                    : x,
                                ),
                              )
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
                            value={getFundNameById(l.fundId) || ""}
                            onValueChange={(value) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === l.key
                                    ? { ...x, fundId: value || "" }
                                    : x,
                                ),
                              )
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
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === l.key
                                    ? { ...x, description: e.target.value }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Description (optional)"
                            disabled={busy}
                          />
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Select
                            value={l.direction}
                            onValueChange={(value) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === l.key
                                    ? {
                                        ...x,
                                        direction: value as Direction,
                                      }
                                    : x,
                                ),
                              )
                            }
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
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === l.key
                                    ? {
                                        ...x,
                                        amount: parseInputAsCents(
                                          e.target.value,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            placeholder="$0.00"
                            className="text-right tabular-nums"
                            disabled={busy}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="text-muted-foreground text-xs">
                              Pending
                            </div>
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
                              disabled={busy}
                            />
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((x) => x.key !== l.key),
                              )
                            }
                            disabled={busy}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DrawerFooter className="border-t p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
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

                <div className="flex flex-wrap items-center gap-2">
                  {initialEvent && !editing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(true)}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                  )}
                  {initialEvent && editing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(false)}
                      disabled={busy}
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
              </div>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

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
                        value={getWalletNameById(l.walletId) || ""}
                        onValueChange={(value) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, walletId: value || "" }
                                : x,
                            ),
                          )
                        }
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
                        value={getFundNameById(l.fundId) || ""}
                        onValueChange={(value) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, fundId: value || "" }
                                : x,
                            ),
                          )
                        }
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
                      <Select
                        value={l.direction}
                        onValueChange={(value) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? {
                                    ...x,
                                    direction: value as Direction,
                                  }
                                : x,
                            ),
                          )
                        }
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
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? {
                                    ...x,
                                    amount: parseInputAsCents(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                        placeholder="$0.00"
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
                        <TrashIcon className="h-4 w-4" />
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
