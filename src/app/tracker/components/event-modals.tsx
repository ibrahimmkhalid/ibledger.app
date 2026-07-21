"use client";

import dynamic from "next/dynamic";
import { toast } from "sonner";

import { isIncomeLike } from "@/app/tracker/lib/events";
import type { Fund, TransactionEvent, Wallet } from "@/app/tracker/types";

const TransactionModal = dynamic(
  () =>
    import("@/app/tracker/components/transaction-modal").then(
      (m) => m.TransactionModal,
    ),
  { ssr: false },
);

const IncomeModal = dynamic(
  () =>
    import("@/app/tracker/components/income-modal").then((m) => m.IncomeModal),
  { ssr: false },
);

// The create pair plus the details pair, as rendered by both the overview and
// the transactions page. Which details modal opens is decided by isIncomeLike,
// since income events and expense events are edited through different forms.
export function EventModals(args: {
  wallets: Wallet[];
  funds: Fund[];
  createTransactionOpen: boolean;
  onCreateTransactionOpenChange: (open: boolean) => void;
  createIncomeOpen: boolean;
  onCreateIncomeOpenChange: (open: boolean) => void;
  detailsEvent: TransactionEvent | null;
  onDetailsEventChange: (event: TransactionEvent | null) => void;
  onSaved: () => Promise<void>;
}) {
  const {
    wallets,
    funds,
    createTransactionOpen,
    onCreateTransactionOpenChange,
    createIncomeOpen,
    onCreateIncomeOpenChange,
    detailsEvent,
    onDetailsEventChange,
    onSaved,
  } = args;

  const detailsIsIncome = detailsEvent ? isIncomeLike(detailsEvent) : false;

  const closeDetails = (open: boolean) => {
    if (!open) onDetailsEventChange(null);
  };

  const afterDetails = async (message: string) => {
    toast.success(message);
    await onSaved();
    onDetailsEventChange(null);
  };

  return (
    <>
      <TransactionModal
        open={createTransactionOpen}
        onOpenChange={onCreateTransactionOpenChange}
        wallets={wallets}
        funds={funds}
        onSaved={async () => {
          toast.success("Transaction saved");
          await onSaved();
        }}
      />

      <IncomeModal
        open={createIncomeOpen}
        onOpenChange={onCreateIncomeOpenChange}
        wallets={wallets}
        onSaved={async () => {
          toast.success("Income saved");
          await onSaved();
        }}
      />

      <TransactionModal
        open={Boolean(detailsEvent) && !detailsIsIncome}
        onOpenChange={closeDetails}
        wallets={wallets}
        funds={funds}
        initialEvent={detailsEvent}
        onSaved={() => afterDetails("Transaction updated")}
        onDeleted={() => afterDetails("Transaction deleted")}
      />

      <IncomeModal
        open={Boolean(detailsEvent) && detailsIsIncome}
        onOpenChange={closeDetails}
        wallets={wallets}
        initialEvent={detailsEvent}
        onSaved={() => afterDetails("Income updated")}
        onDeleted={() => afterDetails("Income deleted")}
      />
    </>
  );
}
