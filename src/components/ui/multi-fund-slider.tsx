"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { keyToColorIndex, seriesColor } from "@/app/tracker/lib/series-colors";
import { Swatch } from "@/components/ui/swatch";

export type SliderFund = {
  id: string;
  name: string;
  percentage: number;
  isSavings?: boolean;
};

/** Round to nearest 0.5. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Format a percentage, showing .0 or .5 only when needed. */
function fmtPct(n: number): string {
  const rounded = roundHalf(n);
  if (Number.isInteger(rounded)) {
    return `${Math.round(rounded)}%`;
  }
  return `${rounded}%`;
}

/**
 * Moves boundary `boundaryIndex` to `valuePct`, clamped so it can meet but not
 * cross its neighbours. Shared by pointer drag and keyboard.
 */
function applyBoundary(
  funds: SliderFund[],
  boundaryIndex: number,
  valuePct: number,
): SliderFund[] {
  const curCum: number[] = [];
  let s = 0;
  for (let i = 0; i < funds.length - 1; i++) {
    s += funds[i].percentage;
    curCum.push(s);
  }

  const minVal = boundaryIndex > 0 ? curCum[boundaryIndex - 1] : 0;
  const maxVal =
    boundaryIndex < curCum.length - 1 ? curCum[boundaryIndex + 1] : 100;
  const clamped = Math.max(minVal, Math.min(maxVal, valuePct));

  const newCum = [...curCum];
  newCum[boundaryIndex] = clamped;

  return funds.map((f, i) => {
    const prev = i > 0 ? newCum[i - 1] : 0;
    const curr = i < newCum.length ? newCum[i] : 100;
    return { ...f, percentage: curr - prev };
  });
}

type Props = {
  funds: SliderFund[];
  onChange: (funds: SliderFund[]) => void;
  disabled?: boolean;
};

export function MultiFundSlider({ funds, onChange, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fundsRef = useRef(funds);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    fundsRef.current = funds;
    onChangeRef.current = onChange;
  });

  // Segment labels are decided in pixels, not percent: 8% of a phone-width
  // track is 27px and fits nothing, while 8% of a desktop track fits a name.
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setTrackWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [dragging, setDragging] = useState<number | null>(null);
  // Pointer-to-boundary distance at grab time; handles are 20px wide, so the
  // raw pointer would snap the boundary to wherever inside one it was pressed.
  const dragOffsetRef = useRef(0);

  // Cumulative boundary positions: for N funds we have N-1 draggable handles.
  const cumValues: number[] = [];
  let cumSum = 0;
  for (let i = 0; i < funds.length - 1; i++) {
    cumSum += funds[i].percentage;
    cumValues.push(cumSum);
  }

  // A 0%-wide fund stacks two handles, and only the top one catches the
  // pointer. Spread them a few px apart; the boundary values are unchanged.
  const handleOffsets = cumValues.map(() => 0);
  for (let i = 0; i < cumValues.length; ) {
    let j = i;
    while (j + 1 < cumValues.length && cumValues[j + 1] === cumValues[i]) j++;
    const count = j - i + 1;
    if (count > 1) {
      for (let k = i; k <= j; k++) {
        handleOffsets[k] = (k - i - (count - 1) / 2) * 7;
      }
    }
    i = j + 1;
  }

  // Pre-compute per-fund colour (savings always gets the neutral fill).
  const colors = funds.map((f) =>
    seriesColor(f.isSavings ? -1 : keyToColorIndex(f.id), f.isSavings),
  );

  // ── Drag handling via document-level listeners (refs keep it stable) ──

  useEffect(() => {
    if (dragging === null || !trackRef.current) return;
    const track = trackRef.current;

    const handleMove = (e: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const rawPct =
        ((e.clientX - dragOffsetRef.current - rect.left) / rect.width) * 100;
      const pct = roundHalf(Math.max(0, Math.min(100, rawPct)));
      onChangeRef.current(applyBoundary(fundsRef.current, dragging, pct));
    };

    const handleUp = () => setDragging(null);

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [dragging]);

  function nudge(boundaryIndex: number, delta: number) {
    const cur = fundsRef.current;
    let s = 0;
    for (let i = 0; i <= boundaryIndex; i++) s += cur[i].percentage;
    onChangeRef.current(
      applyBoundary(cur, boundaryIndex, roundHalf(s + delta)),
    );
  }

  function onHandleKeyDown(e: React.KeyboardEvent, boundaryIndex: number) {
    const big = e.shiftKey ? 5 : 0.5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(boundaryIndex, -big);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      nudge(boundaryIndex, big);
    } else if (e.key === "Home") {
      e.preventDefault();
      nudge(boundaryIndex, -100);
    } else if (e.key === "End") {
      e.preventDefault();
      nudge(boundaryIndex, 100);
    }
  }

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

          // The percentage is the number worth keeping, so it is the last
          // thing dropped; the legend below names every fund either way.
          const segmentPx = (width / 100) * trackWidth;
          const showPercentage = segmentPx >= 44;
          const showName = segmentPx >= 96;

          return (
            <div
              key={fund.id}
              title={`${fund.name} ${fmtPct(fund.percentage)}`}
              className={cn(
                "absolute top-0 flex h-full items-center justify-center overflow-hidden",
                isFirst && "rounded-l-lg",
                isLast && "rounded-r-lg",
              )}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: colors[i].bg,
                ...(fund.isSavings
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(255,255,255,.18) 3px,rgba(255,255,255,.18) 6px)",
                    }
                  : {}),
              }}
            >
              {showPercentage && (
                <span
                  className="flex min-w-0 items-baseline gap-1 px-1 text-xs font-semibold drop-shadow-sm"
                  style={{ color: colors[i].fg }}
                >
                  {showName && <span className="truncate">{fund.name}</span>}
                  <span className="shrink-0 tabular-nums">
                    {fmtPct(fund.percentage)}
                  </span>
                </span>
              )}
            </div>
          );
        })}

        {/* Draggable / keyboard-adjustable handles */}
        {!disabled &&
          cumValues.map((val, i) => (
            <div
              key={`handle-${i}`}
              role="slider"
              tabIndex={0}
              aria-label={`Split between ${funds[i].name} and ${funds[i + 1].name}`}
              aria-valuemin={i > 0 ? cumValues[i - 1] : 0}
              aria-valuemax={i < cumValues.length - 1 ? cumValues[i + 1] : 100}
              aria-valuenow={val}
              aria-valuetext={`${fmtPct(funds[i].percentage)} ${funds[i].name}`}
              className="focus-visible:ring-ring absolute top-0 z-10 flex h-full w-5 cursor-col-resize items-center justify-center rounded-sm outline-none focus-visible:ring-2"
              style={{
                left: `${val}%`,
                transform: `translateX(calc(-50% + ${handleOffsets[i]}px))`,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).focus();
                const rect = trackRef.current?.getBoundingClientRect();
                dragOffsetRef.current = rect
                  ? e.clientX - (rect.left + (val / 100) * rect.width)
                  : 0;
                setDragging(i);
              }}
              onKeyDown={(e) => onHandleKeyDown(e, i)}
            >
              <div
                className={cn(
                  "border-border bg-card h-8 w-1.5 rounded-full border shadow-md transition-transform",
                  "hover:bg-muted hover:scale-110",
                  dragging === i && "bg-muted scale-110",
                )}
              />
            </div>
          ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {funds.map((fund, i) => (
          <div key={fund.id} className="flex items-center gap-1.5 text-sm">
            <Swatch color={colors[i].bg} hatched={fund.isSavings} />
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
