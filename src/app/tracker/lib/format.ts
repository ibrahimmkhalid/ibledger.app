let moneyFormatter: Intl.NumberFormat;

try {
  // currencySign: "accounting" renders negatives as parentheses in most runtimes.
  moneyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currencySign: "accounting" as any,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
} catch {
  moneyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtAmount(
  n: number,
  style: "accounting" | "plain" = "accounting",
) {
  if (style === "accounting") {
    return moneyFormatter.format(Number(n));
  } else if (style === "plain") {
    return Number(n).toFixed(2).replace(/-/, "");
  }
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
