type FundBalance = {
  isSavings: boolean;
  balance: number;
  balanceWithPending: number;
};

// Clamps non-savings funds at 0 and moves the deficit onto savings, returning
// the raw figures alongside. See "The savings fund" in docs/CONTEXT.md.
export function applySavingsDeficitClamp<T extends FundBalance>(funds: T[]) {
  // Without exactly one savings fund the totals would silently lie.
  const savingsCount = funds.filter((f) => f.isSavings).length;
  if (savingsCount !== 1) {
    throw new Error(
      `Ledger must have exactly one savings fund, found ${savingsCount}`,
    );
  }

  const withRaw = funds.map((f) => ({
    ...f,
    rawBalance: Number(f.balance),
    rawBalanceWithPending: Number(f.balanceWithPending),
  }));

  const deficit = (pick: (f: (typeof withRaw)[number]) => number) =>
    withRaw
      .filter((f) => !f.isSavings)
      .reduce((acc, f) => acc + Math.max(0, -pick(f)), 0);

  const deficitCleared = deficit((f) => f.rawBalance);
  const deficitWithPending = deficit((f) => f.rawBalanceWithPending);

  return withRaw.map((f) => ({
    ...f,
    balance: f.isSavings
      ? f.rawBalance - deficitCleared
      : Math.max(0, f.rawBalance),
    balanceWithPending: f.isSavings
      ? f.rawBalanceWithPending - deficitWithPending
      : Math.max(0, f.rawBalanceWithPending),
  }));
}
