import { fmtAmount } from "@/app/tracker/lib/format";

// An empty amount must render as an empty field, not "$0.00". Leaving content
// in the input hides the placeholder and, because the text is right-aligned,
// lets a caret clicked into the empty left margin prepend digits — typing 4200
// at index 0 of "$0.00" yields $42,000.00 rather than $42.00.
//
// Formatting goes through the same currency formatter as every displayed
// balance, so a field reads "$1,200.00" exactly as the figure it will become.
// Callers should use AmountInput rather than wiring this to an input directly:
// grouping changes the string's length at the thousands boundary, which needs
// caret handling.
export function formatCentsToDisplay(cents: number | string): string {
  if (typeof cents === "string" && cents.trim() === "") return "";
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(n)) return "";
  return fmtAmount(n / 100, "plain");
}

export function parseInputAsCents(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";

  const cents = Number(cleaned);
  // Backspacing "$0.09" leaves "$0.0", whose digits are "00". Treating that as
  // empty is what lets the last keystroke clear the field; otherwise it bottoms
  // out at "$0.00" and can only be cleared by selecting all and deleting.
  // Leading zeros carry no meaning in cents-first entry either.
  if (cents === 0) return "";

  return String(cents);
}
