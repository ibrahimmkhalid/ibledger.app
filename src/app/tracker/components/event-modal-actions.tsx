"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function EventModalActions(args: {
  hasInitialEvent: boolean;
  editing: boolean;
  busy: boolean;
  onDelete?: () => void;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onCreate?: () => void;
  onSaveEdit?: () => void;
  labels?: Partial<{
    create: ReactNode;
    saveEdit: ReactNode;
  }>;
}) {
  const {
    hasInitialEvent,
    editing,
    busy,
    onDelete,
    onStartEdit,
    onCancelEdit,
    onCreate,
    onSaveEdit,
    labels,
  } = args;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {hasInitialEvent && (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={busy}
          >
            Delete
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasInitialEvent && !editing && (
          <Button
            type="button"
            variant="outline"
            onClick={onStartEdit}
            disabled={busy}
          >
            Edit
          </Button>
        )}
        {hasInitialEvent && editing && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelEdit}
            disabled={busy}
          >
            Cancel
          </Button>
        )}

        {!hasInitialEvent && (
          <Button type="button" onClick={onCreate} disabled={busy}>
            {labels?.create ?? "Save"}
          </Button>
        )}
        {hasInitialEvent && editing && (
          <Button type="button" onClick={onSaveEdit} disabled={busy}>
            {labels?.saveEdit ?? "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
