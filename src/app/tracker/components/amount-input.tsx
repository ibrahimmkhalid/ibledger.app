"use client";

import { useLayoutEffect, useRef } from "react";

import {
  formatCentsToDisplay,
  parseInputAsCents,
} from "@/app/tracker/lib/cents";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
>;

/**
 * The cents-first money field. `value` is a plain cents string ("4200") shown
 * as a formatted amount ("$42.00"). Entry appends, so the caret is pinned to
 * the end; see "Amount input masking" in docs/CONTEXT.md.
 */
export function AmountInput({
  value,
  onValueChange,
  className,
  ...props
}: InputProps & {
  /** Cents as a digit string; "" for an empty field. */
  value: string;
  onValueChange: (cents: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const display = formatCentsToDisplay(value);

  useLayoutEffect(() => {
    const element = ref.current;
    // Only while the user is typing in this field. Moving the caret of an
    // unfocused input would steal focus in some browsers.
    if (!element || document.activeElement !== element) return;

    const end = element.value.length;
    if (element.selectionStart !== end || element.selectionEnd !== end) {
      element.setSelectionRange(end, end);
    }
  }, [display]);

  return (
    <Input
      ref={ref}
      inputMode="numeric"
      value={display}
      onChange={(event) => onValueChange(parseInputAsCents(event.target.value))}
      className={cn("text-right tabular-nums", className)}
      {...props}
    />
  );
}
