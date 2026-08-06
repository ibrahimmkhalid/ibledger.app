"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * An icon button whose action is currently unavailable, with the reason
 * attached.
 *
 * It reads as disabled and never runs the action, but stays focusable and
 * clickable on purpose: tooltips only open on hover and focus, so a truly
 * `disabled` control leaves a touch user with a greyed-out icon and no way at
 * all to find out why. Pointer users get the tooltip, touch users get the same
 * sentence as a toast.
 */
export function UnavailableActionButton(args: {
  /** Why the action can't be taken. Shown verbatim in the tooltip and toast. */
  reason: string;
  /** What the button would have done, e.g. "Delete Groceries". */
  label: string;
  size?: "icon" | "icon-sm" | "icon-xs";
  className?: string;
  children: ReactNode;
}) {
  const { reason, label, size = "icon", className, children } = args;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-disabled="true"
          aria-label={`${label}: ${reason}`}
          onClick={() => toast.info(reason)}
          className={cn(
            "text-muted-foreground cursor-help opacity-50 hover:bg-transparent hover:text-current dark:hover:bg-transparent",
            className,
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
