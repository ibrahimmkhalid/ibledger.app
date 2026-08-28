"use client";

import { useState } from "react";

import { toast } from "sonner";
import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { holdsMoney } from "@/lib/money";
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

/** Each modal commits on its own; there is no draft to revert. */
export function WalletsCard(args: {
  wallets: Wallet[];
  onReload: () => Promise<void>;
}) {
  const { wallets, onReload } = args;
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);
  const [modalKey, setModalKey] = useState(0);

  function openCreate() {
    setModalKey((n) => n + 1);
    setCreateOpen(true);
  }

  function openEdit(wallet: Wallet) {
    setModalKey((n) => n + 1);
    setEditWallet(wallet);
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
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function updateWallet(wallet: Wallet, data: WalletFormState) {
    setBusy(true);
    try {
      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: data.name }),
      });
      setEditWallet(null);
      toast.success("Wallet updated");
      await onReload();
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
      await onReload();
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

      <WalletModal
        key={`edit-wallet-${modalKey}`}
        open={Boolean(editWallet)}
        onOpenChange={(open: boolean) => {
          if (!open) setEditWallet(null);
        }}
        title="Edit wallet"
        initial={
          editWallet
            ? {
                name: editWallet.name,
              }
            : undefined
        }
        busy={busy}
        onSave={(data) => {
          if (!editWallet) return;
          return updateWallet(editWallet, data);
        }}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Wallets</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onReload()}
                disabled={busy}
              >
                <RefreshCwIcon />
                Refresh
              </Button>
              <Button size="sm" onClick={openCreate} disabled={busy}>
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
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w) => {
                const del = canDeleteWallet(w, wallets.length);

                return (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-right text-sm whitespace-normal tabular-nums">
                      <ClearedWithPending
                        cleared={w.balance}
                        withPending={w.balanceWithPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2 sm:gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(w)}
                          disabled={busy}
                          aria-label={`Edit ${w.name}`}
                        >
                          <PencilIcon />
                        </Button>
                        {del.ok ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void deleteWallet(w)}
                            disabled={busy}
                            aria-label={`Delete ${w.name}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon />
                          </Button>
                        ) : (
                          <UnavailableActionButton
                            label={`Can't delete ${w.name}`}
                            reason={del.reason ?? "Unavailable"}
                          >
                            <Trash2Icon />
                          </UnavailableActionButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
