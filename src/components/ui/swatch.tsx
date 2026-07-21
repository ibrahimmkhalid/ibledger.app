import { cn } from "@/lib/utils";

const HATCH =
  "repeating-linear-gradient(-45deg,transparent,transparent 2px,rgba(255,255,255,.3) 2px,rgba(255,255,255,.3) 4px)";

/**
 * The single fund/wallet colour chip. One size, one radius everywhere it
 * appears — slider legend, funds table, transaction rows — so the swatch
 * always reads as the same element.
 */
export function Swatch({
  color,
  hatched,
  className,
}: {
  color: string;
  hatched?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 rounded-[3px]", className)}
      style={{
        backgroundColor: color,
        ...(hatched ? { backgroundImage: HATCH } : {}),
      }}
    />
  );
}
