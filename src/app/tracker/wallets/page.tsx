"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";
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
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import { ClearedWithPending } from "@/app/tracker/components/cleared-with-pending";
import { useConfirm } from "@/app/tracker/components/confirm-dialog";
import { WalletsSkeleton } from "@/app/tracker/components/loading-skeletons";
import { UnavailableActionButton } from "@/app/tracker/components/unavailable-action-button";
import { holdsMoney } from "@/lib/money";
import type { Wallet } from "@/app/tracker/types";

// Mirrors the guard the DELETE handler enforces, so the button is never
// offered for a deletion that is certain to fail. The last-wallet rule is a
// client-side rule: a ledger with no wallet has nowhere to record anything.
function canDeleteWallet(
  wallet: Wallet,
  walletCount: number,
): { ok: boolean; reason?: string } {
  if (walletCount <= 1) {
    return { ok: false, reason: "Your last wallet can't be deleted" };
  }
  if (holdsMoney(Number(wallet.balanceWithPending))) {
    return {
      ok: false,
      reason:
        "Still holds money (including pending). Move it to another wallet first.",
    };
  }
  return { ok: true };
}

export default function WalletsPage() {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [wallets, setWallets] = useState<Wallet[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    // When bootstrap redirects, keep the skeleton up until navigation lands;
    // clearing it would flash an empty wallets page mid-redirect.
    let redirected = false;
    try {
      const ready = await checkBootstrapOrRedirect(router);
      if (!ready) {
        redirected = true;
        return;
      }
      const res = await apiJson<{ wallets: Wallet[] }>("/api/wallets");
      setWallets(res.wallets);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load wallets");
    } finally {
      if (!redirected) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // These rethrow instead of toasting: WalletModal shows the reason next to
  // the name field, the same as during onboarding. It also blocks an empty
  // name before calling in, so there is nothing to check for here.
  async function createWallet(data: WalletFormState) {
    setBusy(true);
    try {
      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name }),
      });
      setCreateOpen(false);
      toast.success("Wallet created");
      await refresh();
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
      await refresh();
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
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete wallet");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <WalletsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Wallets</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCwIcon />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New wallet
          </Button>
        </div>
      </div>

      <WalletModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New wallet"
        busy={busy}
        onSave={createWallet}
      />

      <WalletModal
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
          <CardTitle>All wallets</CardTitle>
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
                          onClick={() => setEditWallet(w)}
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
    </div>
  );
}
