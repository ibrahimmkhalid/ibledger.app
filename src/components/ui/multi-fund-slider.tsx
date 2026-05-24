"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type SliderFund = {
  id: string;
  name: string;
  percentage: number;
  isSavings?: boolean;
};

const SEGMENT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-lime-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-yellow-500",
  "bg-violet-500",
];

/** Deterministic hash from a string to a stable colour index. */
export function keyToColorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const len = SEGMENT_COLORS.length;
  return ((Math.abs(hash) % len) + len) % len;
}

/** Return the Tailwind bg class for a given fund index. */
export function segmentColor(index: number, isSavings?: boolean): string {
  if (isSavings) return "bg-slate-400";
  const len = SEGMENT_COLORS.length;
  return SEGMENT_COLORS[((index % len) + len) % len];
}

/** Round to nearest 0.5. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Format a percentage for display — showing .0 or .5 only when needed. */
function fmtPct(n: number): string {
  const rounded = roundHalf(n);
  if (Number.isInteger(rounded)) {
    return `${Math.round(rounded)}%`;
  }
  return `${rounded}%`;
}

type Props = {
  funds: SliderFund[];
  onChange: (funds: SliderFund[]) => void;
  disabled?: boolean;
};

export function MultiFundSlider({ funds, onChange, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fundsRef = useRef(funds);
  fundsRef.current = funds;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [dragging, setDragging] = useState<number | null>(null);

  // Cumulative boundary positions: for N funds we have N-1 draggable handles.
  const cumValues: number[] = [];
  let cumSum = 0;
  for (let i = 0; i < funds.length - 1; i++) {
    cumSum += funds[i].percentage;
    cumValues.push(cumSum);
  }

  // Pre-compute per-fund colour index (savings always gets -1).
  const colorIndices: number[] = funds.map((f) =>
    f.isSavings ? -1 : keyToColorIndex(f.id),
  );

  // ── Drag handling via document-level listeners (refs keep it stable) ──

  useEffect(() => {
    if (dragging === null || !trackRef.current) return;
    const track = trackRef.current;
    const MIN_PCT = 1;

    const handleMove = (e: PointerEvent) => {
      const cur = fundsRef.current;
      const rect = track.getBoundingClientRect();
      const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
      const pct = roundHalf(Math.max(0, Math.min(100, rawPct)));

      // Rebuild current cumulative values.
      const curCum: number[] = [];
      let s = 0;
      for (let i = 0; i < cur.length - 1; i++) {
        s += cur[i].percentage;
        curCum.push(s);
      }

      const minVal = (dragging > 0 ? curCum[dragging - 1] : 0) + MIN_PCT;
      const maxVal =
        (dragging < curCum.length - 1 ? curCum[dragging + 1] : 100) - MIN_PCT;
      const clamped = Math.max(minVal, Math.min(maxVal, pct));

      const newCum = [...curCum];
      newCum[dragging] = clamped;

      const next = cur.map((f, i) => {
        const prev = i > 0 ? newCum[i - 1] : 0;
        const curr = i < newCum.length ? newCum[i] : 100;
        return { ...f, percentage: curr - prev };
      });

      onChangeRef.current(next);
    };

    const handleUp = () => setDragging(null);

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [dragging]);

  if (funds.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-12 w-full overflow-visible rounded-lg select-none"
        style={{ touchAction: "none" }}
      >
        {/* Coloured segments */}
        {funds.map((fund, i) => {
          const left = i === 0 ? 0 : cumValues[i - 1];
          const width = fund.percentage;
          const isFirst = i === 0;
          const isLast = i === funds.length - 1;

          return (
            <div
              key={fund.id}
              className={cn(
                "absolute top-0 flex h-full items-center justify-center overflow-hidden",
                segmentColor(colorIndices[i], fund.isSavings),
                isFirst && "rounded-l-lg",
                isLast && "rounded-r-lg",
              )}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                ...(fund.isSavings
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(255,255,255,.18) 3px,rgba(255,255,255,.18) 6px)",
                    }
                  : {}),
              }}
            >
              {width > 8 && (
                <span className="truncate px-1 text-xs font-semibold text-white drop-shadow-sm">
                  {fund.name} {fmtPct(fund.percentage)}
                </span>
              )}
            </div>
          );
        })}

        {/* Draggable handles */}
        {!disabled &&
          cumValues.map((val, i) => (
            <div
              key={`handle-${i}`}
              className="absolute top-0 z-10 flex h-full w-5 -translate-x-1/2 cursor-col-resize items-center justify-center"
              style={{ left: `${val}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(i);
              }}
            >
              <div
                className={cn(
                  "h-8 w-1.5 rounded-full border border-gray-300 bg-white shadow-md transition-transform",
                  "hover:scale-110 hover:bg-gray-50",
                  dragging === i && "scale-110 bg-gray-100",
                )}
              />
            </div>
          ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {funds.map((fund, i) => (
          <div key={fund.id} className="flex items-center gap-1.5 text-sm">
            <div
              className={cn(
                "h-3 w-3 rounded-sm",
                segmentColor(colorIndices[i], fund.isSavings),
              )}
              style={
                fund.isSavings
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(-45deg,transparent,transparent 2px,rgba(255,255,255,.3) 2px,rgba(255,255,255,.3) 4px)",
                    }
                  : undefined
              }
            />
            <span className="font-medium">{fund.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {fmtPct(fund.percentage)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
