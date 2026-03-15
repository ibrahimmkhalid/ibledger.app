export function formatCentsToDisplay(cents: number | string): string {
  const n = typeof cents === "string" ? Number(cents) || 0 : cents;
  if (!n && n !== 0) return "$0.00";
  return `$${(n / 100).toFixed(2)}`;
}

export function parseInputAsCents(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return String(Number(cleaned));
}
