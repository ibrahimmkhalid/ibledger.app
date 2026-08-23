import { cn } from "@/lib/utils";

const HATCH =
  "repeating-linear-gradient(-45deg,transparent,transparent 2px,rgba(255,255,255,.3) 2px,rgba(255,255,255,.3) 4px)";

/** The one fund and wallet colour chip: same size and radius everywhere. */
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
