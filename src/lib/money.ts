// Half a cent. Anything smaller is float dust, not money.
export const MONEY_TOLERANCE = 0.005;

// True when the balance is real money. Fails closed on NaN and Infinity.
export function holdsMoney(amount: number) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return true;
  return Math.abs(n) >= MONEY_TOLERANCE;
}
