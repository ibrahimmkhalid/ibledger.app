import { fmtAmount } from "@/app/tracker/lib/format";

// An empty amount renders as an empty field, not "$0.00". Wire this through
// AmountInput rather than an input directly; see "Amount input masking" in
// docs/CONTEXT.md.
export function formatCentsToDisplay(cents: number | string): string {
  if (typeof cents === "string" && cents.trim() === "") return "";
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(n)) return "";
  return fmtAmount(n / 100, "plain");
}

// The most digits of cents a double holds exactly; at 16 an entry silently
// rounds. The ceiling is $9,999,999,999,999.99.
const MAX_CENTS_DIGITS = 15;

export function parseInputAsCents(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";

  // Leading zeros carry no meaning in cents-first entry, and dropping them
  // before the cap keeps a padded "$0.01" from measuring as sixteen digits.
  const digits = cleaned.replace(/^0+/, "");
  // All-zero digits count as empty, so the last backspace clears the field.
  if (!digits) return "";

  // Trimmed rather than converted, so keystrokes past the cap are refused.
  return digits.slice(0, MAX_CENTS_DIGITS);
}
