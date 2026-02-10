"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import type { Fund } from "@/app/tracker/types";

type FundFormState = {
  name: string;
  openingAmount: string;
  pullPercentage: string;
};

function FundModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: FundFormState;
  disablePullPercentage?: boolean;
  busy: boolean;
  onSave: (data: FundFormState) => void | Promise<void>;
}) {
  const {
    open,
    onOpenChange,
    title,
    initial,
    disablePullPercentage,
    busy,
    onSave,
  } = args;
  const [name, setName] = useState(initial?.name ?? "");
  const [openingAmount, setOpeningAmount] = useState(
    initial?.openingAmount ?? "0",
  );
  const [pullPercentage, setPullPercentage] = useState(
    initial?.pullPercentage ?? "0",
  );

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setOpeningAmount(initial?.openingAmount ?? "0");
    setPullPercentage(initial?.pullPercentage ?? "0");
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
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Pull percentage</div>
            <Input
              inputMode="decimal"
              value={pullPercentage}
              onChange={(e) => setPullPercentage(e.target.value)}
              disabled={Boolean(disablePullPercentage)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void onSave({ name, openingAmount, pullPercentage })}
            disabled={busy}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FundsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editFund, setEditFund] = useState<Fund | null>(null);

  const displayFunds = useMemo(() => funds, [funds]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson("/api/bootstrap", { method: "POST", body: "{}" });
      const res = await apiJson<{ funds: Fund[] }>("/api/funds");
      setFunds(res.funds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load funds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createFund(data: FundFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      const pullPercentage = Number(data.pullPercentage);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");
      if (
        Number.isNaN(pullPercentage) ||
        pullPercentage < 0 ||
        pullPercentage > 100
      ) {
        throw new Error("Invalid pull percentage");
      }

      await apiJson("/api/funds", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          openingAmount,
          pullPercentage,
        }),
      });
      setCreateOpen(false);
      setNotice("Fund created");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create fund");
    } finally {
      setBusy(false);
    }
  }

  async function updateFund(fund: Fund, data: FundFormState) {
    setBusy(true);
    setError(null);
    try {
      const openingAmount = Number(data.openingAmount);
      const pullPercentage = Number(data.pullPercentage);
      if (!data.name.trim()) throw new Error("Name is required");
      if (Number.isNaN(openingAmount))
        throw new Error("Invalid opening amount");
      if (
        Number.isNaN(pullPercentage) ||
        pullPercentage < 0 ||
        pullPercentage > 100
      ) {
        throw new Error("Invalid pull percentage");
      }

      await apiJson("/api/funds", {
        method: "PATCH",
        body: JSON.stringify({
          id: fund.id,
          name: data.name,
          openingAmount,
          pullPercentage,
        }),
      });
      setEditFund(null);
      setNotice("Fund updated");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update fund");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFund(fund: Fund) {
    const ok = window.confirm(
      `Delete fund "${fund.name}"? This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await apiJson("/api/funds", {
        method: "DELETE",
        body: JSON.stringify({ id: fund.id }),
      });
      setNotice("Fund deleted");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete fund");
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
          Loading funds.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Funds</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>New fund</Button>
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

      <FundModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New fund"
        busy={busy}
        onSave={createFund}
      />

      <FundModal
        open={Boolean(editFund)}
        onOpenChange={(open: boolean) => {
          if (!open) setEditFund(null);
        }}
        title="Edit fund"
        initial={
          editFund
            ? {
                name: editFund.name,
                openingAmount: String(editFund.openingAmount),
                pullPercentage: String(editFund.pullPercentage ?? 0),
              }
            : undefined
        }
        disablePullPercentage={Boolean(editFund?.isSavings)}
        busy={busy}
        onSave={(data) => {
          if (!editFund) return;
          return updateFund(editFund, data);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>All funds</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[110px]">Savings</TableHead>
                <TableHead className="w-[130px] text-right">Pull %</TableHead>
                <TableHead className="w-[140px] text-right">Balance</TableHead>
                <TableHead className="w-[160px] text-right">
                  With pending
                </TableHead>
                <TableHead className="w-[220px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayFunds.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{f.isSavings ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.isSavings ? "—" : `${Number(f.pullPercentage ?? 0)}%`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(f.balance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(f.balanceWithPending)}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditFund(f)}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    {f.isSavings ? null : (
                      <Button
                        variant="destructive"
                        onClick={() => void deleteFund(f)}
                        disabled={busy}
                      >
                        Delete
                      </Button>
                    )}
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
