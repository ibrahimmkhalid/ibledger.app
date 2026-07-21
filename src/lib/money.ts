// Balances are double precision, so arithmetic leaves dust: 0.1 + 0.2 - 0.3
// lands on 5.55e-17 rather than 0. Anything under half a cent is that dust,
// not money.
export const MONEY_TOLERANCE = 0.005;

// True when the balance is real money rather than float dust. Wallets and funds
// that hold money cannot be deleted.
//
// Fails closed on NaN/Infinity: a broken balance computation must block the
// destructive action rather than read as "holds nothing" and let it through.
export function holdsMoney(amount: number) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return true;
  return Math.abs(n) >= MONEY_TOLERANCE;
}
