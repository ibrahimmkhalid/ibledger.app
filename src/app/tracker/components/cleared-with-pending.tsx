import { fmtAmount } from "@/app/tracker/lib/format";

// Renders a cleared balance with the pending delta in brackets, e.g.
// "$590.00 [+$190.00]". Shared by the overview, wallets, and funds tables.
export function ClearedWithPending(args: {
  cleared: number;
  withPending: number;
}) {
  const cleared = Number(args.cleared);
  const withPending = Number(args.withPending);
  const delta = withPending - cleared;

  const sign = delta > 0 ? "+" : "-";
  return (
    <>
      <span className="font-semibold">{fmtAmount(cleared)}</span>
      {delta !== 0 && (
        <span className="text-muted-foreground ml-2">
          [{sign}${fmtAmount(delta, "plain")}]
        </span>
      )}
    </>
  );
}
