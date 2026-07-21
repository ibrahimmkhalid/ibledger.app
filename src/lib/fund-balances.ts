type FundBalance = {
  isSavings: boolean;
  balance: number;
  balanceWithPending: number;
};

// Display rule:
// - Non-savings funds are visually clamped at 0
// - Savings absorbs all deficits from clamped funds (and may go negative)
//
// Total-preserving: sum(clamped) === sum(raw). Callers get rawBalance and
// rawBalanceWithPending alongside, since the unclamped figures are what the
// delete guard and the overspent badges read.
export function applySavingsDeficitClamp<T extends FundBalance>(funds: T[]) {
  // The clamp moves every deficit onto "the" savings fund; with zero or several
  // of them the totals silently lie, so surface the corrupt ledger as a 500.
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
