import { fmtAmount } from "@/app/tracker/lib/format";
import { cn } from "@/lib/utils";

// Renders a cleared balance with the pending delta in brackets, e.g.
// "$590.00 [+$190.00]". Shared by the overview, wallets, and funds tables.
export function ClearedWithPending(args: {
  cleared: number;
  withPending: number;
}) {
  const cleared = Number(args.cleared);
  const withPending = Number(args.withPending);
  // Balances are floats, so the subtraction leaves dust; round to whole cents
  // so a sub-cent delta doesn't render as "[-$0.00]".
  const deltaCents = Math.round((withPending - cleared) * 100);
  const clearedCents = Math.round(cleared * 100);
  // Rounded, and zero forced positive: -0 formats as "($0.00)" while the tint
  // below reads it as non-negative.
  const displayedCleared = clearedCents === 0 ? 0 : clearedCents / 100;

  const sign = deltaCents > 0 ? "+" : "-";
  return (
    <>
      {/* Accounting parentheses are the only other cue that a balance is
          negative, and plenty of people don't read them as one — "you owe
          $718.50" should not look like "you have $718.50". */}
      <span
        className={cn("font-semibold", clearedCents < 0 && "text-destructive")}
      >
        {fmtAmount(displayedCleared)}
      </span>
      {deltaCents !== 0 && (
        <span className="text-muted-foreground ml-2">
          {`[${sign}${fmtAmount(deltaCents / 100, "plain")}]`}
        </span>
      )}
    </>
  );
}
