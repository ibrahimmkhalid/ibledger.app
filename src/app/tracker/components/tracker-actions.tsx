"use client";

import { CoinsIcon, PlusIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The Refresh / Add transaction / Add income trio in both page headers. */
export function TrackerActions(props: {
  onRefresh: () => void;
  refreshing?: boolean;
  onAddTransaction: () => void;
  onAddIncome: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        onClick={props.onRefresh}
        disabled={props.disabled || props.refreshing}
      >
        <RefreshCwIcon className={cn(props.refreshing && "animate-spin")} />
        Refresh
      </Button>
      <Button onClick={props.onAddTransaction} disabled={props.disabled}>
        <PlusIcon />
        Add transaction
      </Button>
      <Button
        variant="outline"
        onClick={props.onAddIncome}
        disabled={props.disabled}
      >
        {/* Same icon the cards give an income entry, so the button and the
            row it produces read as the same thing. */}
        <CoinsIcon />
        Add income
      </Button>
    </div>
  );
}

/** Floating "Add transaction" button, mobile only, within one-handed reach. */
export function AddTransactionFab(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label="Add transaction"
      className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition focus-visible:ring-2 focus-visible:outline-none sm:hidden"
    >
      <PlusIcon className="size-6" />
    </button>
  );
}
