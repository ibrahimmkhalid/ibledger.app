/**
 * A validation message that sits under the field it is about.
 *
 * The onboarding modals used to toast these to the bottom-right corner —
 * roughly 1000px from the offending field on a wide screen — with no marking
 * on the field itself. Pair this with `aria-invalid` and a destructive border
 * so the field is findable at a glance on any width.
 */
export function FieldError(args: { id: string; message: string | null }) {
  if (!args.message) return null;

  return (
    <p id={args.id} role="alert" className="text-destructive text-xs">
      {args.message}
    </p>
  );
}
