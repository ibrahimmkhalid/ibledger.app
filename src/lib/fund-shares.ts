// funds.pullPercentage is called "Income share" everywhere in the UI, so the
// error text these produce must never leak the column name back to the user.

// Names the field a share complaint belongs under, so the modals can place it
// without matching on the message text.
export const FUND_SHARE_FIELD = "share";

export const FUND_SHARE_RANGE_ERROR = "Income share must be between 0 and 100";

export function fundShareRangeError(name: string) {
  return `Income share for "${name}" must be between 0 and 100`;
}

export const FUND_SHARE_SUM_ERROR =
  "Income shares add up to more than 100%. Lower another fund's share first.";

export function isValidFundShare(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function fundSharesExceedHundred(sum: number) {
  return sum > 100;
}

// Namespaces the per-user advisory lock that serialises fund writes ("fund" in
// ASCII). See "Income shares" in docs/CONTEXT.md.
export const FUND_LOCK_NAMESPACE = 0x66756e64;
