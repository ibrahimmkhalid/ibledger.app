import type { TransactionEvent } from "@/app/tracker/types";

export function sumWalletDelta(children: TransactionEvent["children"]) {
  return children
    .filter((c) => c.status === "posted" && c.walletId)
    .reduce((acc, c) => acc + Number(c.amount), 0);
}

export function sumFundDelta(children: TransactionEvent["children"]) {
  return children
    .filter((c) => c.status === "posted" && c.fundId)
    .reduce((acc, c) => acc + Number(c.amount), 0);
}

export function computeEventDisplayAmount(ev: TransactionEvent) {
  if (ev.children.length === 0) {
    return Number(ev.amount);
  }

  const walletDelta = sumWalletDelta(ev.children);
  return walletDelta !== 0 ? walletDelta : sumFundDelta(ev.children);
}

export function computeEventWalletName(ev: TransactionEvent) {
  if (ev.children.length === 0) {
    return ev.walletName;
  }
  const walletNames = Array.from(
    new Set(ev.children.map((c) => c.walletName).filter(Boolean)),
  );
  if (walletNames.length === 1) return walletNames[0] ?? null;
  if (walletNames.length > 1) return "Multiple";
  return null;
}

export function computeEventFundName(ev: TransactionEvent) {
  if (ev.children.length === 0) {
    return ev.fundName;
  }
  const fundNames = Array.from(
    new Set(ev.children.map((c) => c.fundName).filter(Boolean)),
  );
  if (fundNames.length === 1) return fundNames[0] ?? null;
  if (fundNames.length > 1) return "Multiple";
  return null;
}

export function isIncomeLike(ev: TransactionEvent) {
  if (ev.children.length < 2) return false;
  const allPositive = ev.children.every((c) => Number(c.amount) > 0);
  if (!allPositive) return false;
  const walletIds = new Set(ev.children.map((c) => c.walletId).filter(Boolean));
  if (walletIds.size !== 1) return false;
  return true;
}
