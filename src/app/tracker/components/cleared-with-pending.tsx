import { fmtAmount } from "@/app/tracker/lib/format";

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

  const sign = deltaCents > 0 ? "+" : "-";
  return (
    <>
      <span className="font-semibold">{fmtAmount(cleared)}</span>
      {deltaCents !== 0 && (
        <span className="text-muted-foreground ml-2">
          {`[${sign}${fmtAmount(deltaCents / 100, "plain")}]`}
        </span>
      )}
    </>
  );
}
