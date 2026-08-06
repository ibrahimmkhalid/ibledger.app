// An empty amount must render as an empty field, not "$0.00". Leaving content
// in the input hides the placeholder and, because the text is right-aligned,
// lets a caret clicked into the empty left margin prepend digits — typing 4200
// at index 0 of "$0.00" yields $42,000.00 rather than $42.00.
export function formatCentsToDisplay(cents: number | string): string {
  if (typeof cents === "string" && cents.trim() === "") return "";
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(n)) return "";
  return `$${(n / 100).toFixed(2)}`;
}

export function parseInputAsCents(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return String(Number(cleaned));
}
