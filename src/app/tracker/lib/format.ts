const plainMoneyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let moneyFormatter: Intl.NumberFormat;

try {
  // currencySign: "accounting" renders negatives as parentheses in most runtimes.
  moneyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
} catch {
  moneyFormatter = plainMoneyFormatter;
}

export function fmtAmount(
  n: number,
  style: "accounting" | "plain" = "accounting",
) {
  if (style === "accounting") {
    return moneyFormatter.format(Number(n));
  }

  // "plain" drops the sign: callers pair it with their own +/- treatment. It
  // still goes through the currency formatter, so a pending delta reads
  // "[+$3,000.00]" beside a "$10,918.50" balance rather than "[+$3000.00]",
  // and both halves of the figure follow the same locale.
  return plainMoneyFormatter.format(Math.abs(Number(n)));
}

export function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Use UTC components so ISO timestamps (and date-only strings) don't shift
// backwards/forwards based on the viewer's local timezone.
export function toDateInputValue(input: string | Date) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return isoToday();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fmtDateShort(input: string | Date) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
