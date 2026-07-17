// Balances are double precision, so arithmetic leaves dust: 0.1 + 0.2 - 0.3
// lands on 5.55e-17 rather than 0. Anything under half a cent is that dust,
// not money.
export const MONEY_TOLERANCE = 0.005;

// True when the balance is real money rather than float dust. Wallets and funds
// that hold money cannot be deleted.
//
// Fails open on NaN: a broken balance computation reads as "holds nothing", so
// the delete guard would let it through. Long-standing behaviour at every call
// site, preserved here rather than changed as a side effect of sharing it.
export function holdsMoney(amount: number) {
  const n = Number(amount);
  return Number.isFinite(n) && Math.abs(n) >= MONEY_TOLERANCE;
}
