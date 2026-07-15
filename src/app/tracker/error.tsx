"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
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
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="border-border bg-background hover:bg-muted inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-semibold shadow-sm transition"
      >
        Try again
      </button>
    </div>
  );
}
