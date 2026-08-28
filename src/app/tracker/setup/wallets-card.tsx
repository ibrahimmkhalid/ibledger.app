"use client";

import { useRef, useState } from "react";

import { toast } from "sonner";
import {
  CheckIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
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
import {
  WalletModal,
  type WalletFormState,
} from "@/app/tracker/components/wallet-modal";
import { ClearedWithPending } from "@/app/tracker/components/cleared-with-pending";
import { useConfirm } from "@/app/tracker/components/confirm-dialog";
import { UnavailableActionButton } from "@/app/tracker/components/unavailable-action-button";
import { seriesColorForKey } from "@/app/tracker/lib/series-colors";
import { Swatch } from "@/components/ui/swatch";
import { holdsMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Wallet } from "@/app/tracker/types";

// Mirrors the DELETE handler's guard so the button is never offered for a
// deletion that must fail.
function canDeleteWallet(
  wallet: Wallet,
  walletCount: number,
): { ok: boolean; reason?: string } {
  if (walletCount <= 1) {
    return { ok: false, reason: "Your last wallet can't be deleted" };
  }
  // Weighed apart so they cannot cancel out: $500 against a pending -$500 bill
  // nets to zero while the wallet still holds $500.
  if (
    holdsMoney(Number(wallet.balance)) ||
    holdsMoney(Number(wallet.balanceWithPending))
  ) {
    return {
      ok: false,
      reason:
        "Still holds money (including pending). Move it to another wallet first.",
    };
  }
  return { ok: true };
}

function WalletRow(props: {
  wallet: Wallet;
  busy: boolean;
  walletCount: number;
  onReload: () => Promise<boolean>;
  onDelete: (wallet: Wallet) => Promise<void>;
}) {
  const { wallet, busy, walletCount, onReload, onDelete } = props;
  const [prevServerName, setPrevServerName] = useState(wallet.name);
  const [name, setName] = useState(wallet.name);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  if (prevServerName !== wallet.name) {
    setPrevServerName(wallet.name);
    setName(wallet.name);
  }

  const isDirty = name.trim() !== wallet.name;

  async function save() {
    const trimmed = name.trim();
    // The check button is disabled in both cases; this covers Enter.
    if (!trimmed) return;
    if (trimmed === wallet.name) {
      setName(wallet.name);
      return;
    }
    if (savingRef.current) return;

    savingRef.current = true;
    setIsSaving(true);
    try {
      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: trimmed }),
      });
      toast.success("Wallet updated");
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update wallet");
      setName(wallet.name);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function revert() {
    setName(wallet.name);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      revert();
      e.currentTarget.blur();
    }
  }

  const del = canDeleteWallet(wallet, walletCount);

  return (
    <TableRow key={wallet.id}>
      <TableCell>
        <Swatch color={seriesColorForKey(String(wallet.id)).bg} />
      </TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Wallet name"
          aria-label={`Name of ${wallet.name}`}
          disabled={busy || isSaving}
          className="w-full min-w-0"
        />
      </TableCell>
      {/* Its own column, so the name field is the width the funds one is.
          Hidden rather than unmounted, so showing it shifts nothing. */}
      <TableCell>
        <div
          className={cn(
            "inline-flex items-center gap-2 sm:gap-1",
            !isDirty && "invisible",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void save()}
            disabled={busy || isSaving || !name.trim()}
            aria-label={`Save name for ${wallet.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <CheckIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={revert}
            disabled={busy || isSaving}
            aria-label={`Undo name change for ${wallet.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon />
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        <ClearedWithPending
          cleared={wallet.balance}
          withPending={wallet.balanceWithPending}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex items-center gap-2 sm:gap-1">
          {del.ok ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void onDelete(wallet)}
              disabled={busy || isSaving}
              aria-label={`Delete ${wallet.name}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon />
            </Button>
          ) : (
            <UnavailableActionButton
              label={`Can't delete ${wallet.name}`}
              reason={del.reason ?? "Unavailable"}
            >
              <Trash2Icon />
            </UnavailableActionButton>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Wallet names commit on Enter or the check button; Escape reverts. */
export function WalletsCard(args: {
  wallets: Wallet[];
  onReload: () => Promise<boolean>;
}) {
  const { wallets, onReload } = args;
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  // A mutation can land while the reload that follows it fails, which leaves
  // the list below out of date. Editing it again would act on stale rows.
  const [stale, setStale] = useState(false);
  const locked = busy || stale;

  async function reload() {
    const ok = await onReload();
    setStale(!ok);
    return ok;
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  function openCreate() {
    setModalKey((n) => n + 1);
    setCreateOpen(true);
  }

  // Rethrows instead of toasting; WalletModal shows the reason by the field.
  async function createWallet(data: WalletFormState) {
    setBusy(true);
    try {
      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name }),
      });
      setCreateOpen(false);
      toast.success("Wallet created");
      await reload();
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
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete wallet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {confirmDialog}

      <WalletModal
        key={`create-wallet-${modalKey}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New wallet"
        busy={busy}
        onSave={createWallet}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Wallets</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {stale && (
                <span className="text-muted-foreground text-xs">
                  Out of date
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reload()}
                disabled={busy}
              >
                <RefreshCwIcon />
                Refresh
              </Button>
              <Button size="sm" onClick={openCreate} disabled={locked}>
                <PlusIcon />
                New wallet
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-0"></TableHead>
                <TableHead className="w-1/2">Name</TableHead>
                <TableHead className="w-0"></TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-0"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w) => (
                <WalletRow
                  key={w.id}
                  wallet={w}
                  busy={locked}
                  walletCount={wallets.length}
                  onReload={reload}
                  onDelete={deleteWallet}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
