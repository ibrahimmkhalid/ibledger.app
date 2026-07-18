"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/app/tracker/components/responsive-modal";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Solid-red confirm button + destructive framing for irreversible actions. */
  destructive?: boolean;
};

/**
 * A styled, theme-aware, touch-sized replacement for `window.confirm`. Returns
 * a `confirm(opts) => Promise<boolean>` and the element to render. On mobile it
 * becomes a bottom drawer (via ResponsiveModal); on desktop a centered dialog.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(
    null,
  );
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setState((prev) => (prev ? { ...prev, open: false } : prev));
  }, []);

  const confirmDialog = state ? (
    <ResponsiveModal
      open={state.open}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={state.title}
      renderBody={() =>
        state.description ? (
          <p className="text-muted-foreground text-sm">{state.description}</p>
        ) : null
      }
      renderFooter={() => (
        <>
          <Button variant="outline" onClick={() => settle(false)}>
            {state.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={state.destructive ? "destructive-solid" : "default"}
            onClick={() => settle(true)}
            autoFocus
          >
            {state.confirmLabel ?? "Confirm"}
          </Button>
        </>
      )}
    />
  ) : null;

  return { confirm, confirmDialog };
}
