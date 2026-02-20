"use client";

import { Card } from "@/components/ui/card";

import {
  computeEventDisplayAmount,
  computeEventFundName,
  computeEventWalletName,
  isIncomeLike,
} from "@/app/tracker/lib/events";
import { fmtAmount, fmtDateShort } from "@/app/tracker/lib/format";
import type { TransactionEvent } from "@/app/tracker/types";

import { faClone, faSquare, faTag } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function eventIcon(ev: TransactionEvent) {
  if (isIncomeLike(ev)) return faTag;
  if (!ev.isPosting) return faClone;
  return faSquare;
}

export function TransactionEventCard(args: {
  event: TransactionEvent;
  onClick: () => void;
}) {
  const { event: ev, onClick } = args;

  const net = computeEventDisplayAmount(ev);
  const walletName = computeEventWalletName(ev);
  const fundName = computeEventFundName(ev);
  const meta = [fmtDateShort(ev.occurredAt), walletName, fundName]
    .filter(Boolean)
    .join(" · ");

  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card size="sm" className="hover:bg-muted/30 min-h-11 gap-1 py-1.5">
        <div className="px-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-muted-foreground min-w-0 truncate text-xs">
              <span className="tabular-nums">{meta}</span>
              {ev.isPending && <span> · pending</span>}
            </div>
            <div className="text-sm tabular-nums">
              <span className={net < 0 ? "text-destructive" : ""}>
                {fmtAmount(net)}
              </span>
            </div>
          </div>

          <div className="mt-0.5 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FontAwesomeIcon
                icon={eventIcon(ev)}
                className="text-muted-foreground mt-[2px] size-3.5 shrink-0 opacity-65"
              />
              <div
                className={
                  "min-w-0 truncate text-sm font-medium" +
                  (ev.isPending ? " italic" : "")
                }
              >
                {ev.description ?? "(no description)"}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </button>
  );
}
