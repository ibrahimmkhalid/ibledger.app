/**
 * A validation message that sits under the field it is about. Pair it with
 * `aria-invalid` and a destructive border.
 */
export function FieldError(args: { id: string; message: string | null }) {
  if (!args.message) return null;

  return (
    <p id={args.id} role="alert" className="text-destructive text-xs">
      {args.message}
    </p>
  );
}
