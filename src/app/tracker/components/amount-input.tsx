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
 * The cents-first money field used by every amount input in the app.
 *
 * Entry is append-only: the user types digits and they fill in from the right,
 * so `value` is a plain cents string ("4200") and the field displays the
 * formatted amount ("$42.00").
 *
 * The caret needs pinning because the mask rewrites the whole string on every
 * keystroke and thousands grouping makes its length jump — "$999.99" becomes
 * "$9,999.99", two characters longer. React restores the caret by index after a
 * controlled update, so it would land two characters short of the end and the
 * next digit would be inserted before the last two. Since entry always appends,
 * the caret belongs at the end after any change the mask made.
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
    // Only while the user is actually typing in this field — moving the caret
    // of an unfocused input would steal focus in some browsers.
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
