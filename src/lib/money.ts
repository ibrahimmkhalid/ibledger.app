// Balances are double precision, so arithmetic leaves dust: 0.1 + 0.2 - 0.3
// lands on 5.55e-17 rather than 0. Anything under half a cent is that dust,
// not money.
export const MONEY_TOLERANCE = 0.005;

// Whether a wallet or fund still holds money, and so cannot be deleted.
export function hasResidualBalance(amount: number) {
  const n = Number(amount);
  return Number.isFinite(n) && Math.abs(n) >= MONEY_TOLERANCE;
}
