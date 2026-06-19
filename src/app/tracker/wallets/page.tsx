"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { WalletsSkeleton } from "@/app/tracker/components/loading-skeletons";
import type { BootstrapResponse, Wallet } from "@/app/tracker/types";

type WalletFormState = {
  name: string;
};

function WalletModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: WalletFormState;
  busy: boolean;
  onSave: (data: WalletFormState) => void | Promise<void>;
}) {
  const { open, onOpenChange, title, initial, busy, onSave } = args;
  const [name, setName] = useState(initial?.name ?? "");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:min-w-[40rem]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Name</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void onSave({ name })}
            disabled={busy}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WalletsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [wallets, setWallets] = useState<Wallet[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const boot = await apiJson<BootstrapResponse>("/api/bootstrap", {
        method: "POST",
        body: "{}",
      });
      if (boot.migration?.required) {
        router.replace(boot.migration.redirectTo);
        return;
      }

      if (boot.onboarding?.required) {
        router.replace(boot.onboarding.redirectTo);
        return;
      }
      const res = await apiJson<{ wallets: Wallet[] }>("/api/wallets");
      setWallets(res.wallets);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createWallet(data: WalletFormState) {
    setBusy(true);
    try {
      if (!data.name.trim()) throw new Error("Name is required");

      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name }),
      });
      setCreateOpen(false);
      toast.success("Wallet created");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function updateWallet(wallet: Wallet, data: WalletFormState) {
    setBusy(true);
    try {
      if (!data.name.trim()) throw new Error("Name is required");

      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: data.name }),
      });
      setEditWallet(null);
      toast.success("Wallet updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update wallet");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWallet(wallet: Wallet) {
    const ok = window.confirm(
      `Delete wallet "${wallet.name}"? This cannot be undone.`,
    );
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Wallets</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>New wallet</Button>
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
                <TableHead className="w-[140px] text-right">Balance</TableHead>
                <TableHead className="w-[160px] text-right">
                  With pending
                </TableHead>
                <TableHead className="w-[220px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(w.balance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(w.balanceWithPending)}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditWallet(w)}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void deleteWallet(w)}
                      disabled={busy || wallets.length <= 1}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
