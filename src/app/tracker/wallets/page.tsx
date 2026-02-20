"use client";

import { useCallback, useEffect, useState } from "react";

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
import type { Wallet } from "@/app/tracker/types";

type WalletFormState = {
  name: string;
  openingAmount: string;
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
  const [openingAmount, setOpeningAmount] = useState(
    initial?.openingAmount ?? "0",
  );

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setOpeningAmount(initial?.openingAmount ?? "0");
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
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Opening amount</div>
            <Input
              inputMode="decimal"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void onSave({ name, openingAmount })}
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [wallets, setWallets] = useState<Wallet[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson("/api/bootstrap", { method: "POST", body: "{}" });
      const res = await apiJson<{ wallets: Wallet[] }>("/api/wallets");
      setWallets(res.wallets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createWallet(data: WalletFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");

      await apiJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ name: data.name, openingAmount }),
      });
      setCreateOpen(false);
      setNotice("Wallet created");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function updateWallet(wallet: Wallet, data: WalletFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");

      await apiJson("/api/wallets", {
        method: "PATCH",
        body: JSON.stringify({ id: wallet.id, name: data.name, openingAmount }),
      });
      setEditWallet(null);
      setNotice("Wallet updated");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update wallet");
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
    setError(null);
    try {
      await apiJson("/api/wallets", {
        method: "DELETE",
        body: JSON.stringify({ id: wallet.id }),
      });
      setNotice("Wallet deleted");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete wallet");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading…</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Loading wallets.
        </CardContent>
      </Card>
    );
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

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{error}</CardContent>
        </Card>
      )}

      {notice && (
        <Card>
          <CardHeader>
            <CardTitle>OK</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{notice}</CardContent>
        </Card>
      )}

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
                openingAmount: String(editWallet.openingAmount),
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
