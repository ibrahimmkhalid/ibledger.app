"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type WalletFormState = {
  name: string;
};

export function WalletModal(args: {
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
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-[min(40rem,calc(100vw-2rem))]"
      >
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
