"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/app/tracker/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/app/tracker/components/responsive-modal";
import { cn } from "@/lib/utils";

export type WalletFormState = {
  name: string;
};

export function WalletModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: WalletFormState;
  busy: boolean;
  /** Rejecting shows the reason inline; the caller need not toast it. */
  onSave: (data: WalletFormState) => void | Promise<void>;
}) {
  const { open, onOpenChange, title, initial, busy, onSave } = args;
  const [name, setName] = useState(initial?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const nameId = useId();
  const nameErrorId = useId();

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setNameError(null);
  }, [open, initial]);

  async function save() {
    if (!name.trim()) {
      setNameError("Give the wallet a name");
      return;
    }

    setNameError(null);
    try {
      await onSave({ name });
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Couldn't save this wallet",
      );
    }
  }

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
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              placeholder="e.g. Checking"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
              className={cn(nameError && "border-destructive")}
            />
            <FieldError id={nameErrorId} message={nameError} />
          </div>
        </div>
      )}
      renderFooter={() => (
        <Button type="button" onClick={() => void save()} disabled={busy}>
          Save
        </Button>
      )}
    />
  );
}
