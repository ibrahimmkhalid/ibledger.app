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

// The most digits of cents a double holds exactly. At 16 an entry silently
// rounds — 9999999999999999 comes back as 10000000000000000, so the field shows
// a figure nobody typed — and past 21 String() switches to exponential and puts
// "1e+21" in a value that is supposed to be digits. $9,999,999,999,999.99 is
// the resulting ceiling.
const MAX_CENTS_DIGITS = 15;

export function parseInputAsCents(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";

  // Leading zeros carry no meaning in cents-first entry, and dropping them
  // before the cap keeps a padded "$0.01" from measuring as sixteen digits.
  const digits = cleaned.replace(/^0+/, "");
  // Backspacing "$0.09" leaves "$0.0", whose digits are "00". Treating that as
  // empty is what lets the last keystroke clear the field; otherwise it bottoms
  // out at "$0.00" and can only be cleared by selecting all and deleting.
  if (!digits) return "";

  // Trimming rather than converting through Number: past the cap the extra
  // keystrokes are refused, and below it the digits are already what Number
  // would have produced.
  return digits.slice(0, MAX_CENTS_DIGITS);
}
