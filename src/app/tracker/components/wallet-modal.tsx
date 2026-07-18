"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/app/tracker/components/responsive-modal";

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
  const nameId = useId();

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
  }, [open, initial]);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desktopContentClassName="sm:max-w-[min(40rem,calc(100vw-2rem))]"
      renderBody={() => (
        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checking"
            />
          </div>
        </div>
      )}
      renderFooter={() => (
        <Button
          type="button"
          onClick={() => void onSave({ name })}
          disabled={busy}
        >
          Save
        </Button>
      )}
    />
  );
}
