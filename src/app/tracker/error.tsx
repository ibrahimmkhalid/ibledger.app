"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3">
      <div>
        <h2 className="text-lg font-semibold">This page hit a snag</h2>
        <p className="text-muted-foreground text-sm">
          Something went wrong while loading your ledger. Give it another try.
        </p>
      </div>
      <button
        onClick={() => reset()}
        className="border-border bg-background hover:bg-muted inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-semibold shadow-sm transition"
      >
        Try again
      </button>
    </div>
  );
}
