export default function TransactionsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="bg-muted h-8 w-40 animate-pulse rounded-md" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted h-9 w-20 animate-pulse rounded-md" />
          <div className="bg-muted h-9 w-32 animate-pulse rounded-md" />
          <div className="bg-muted h-9 w-24 animate-pulse rounded-md" />
        </div>
      </div>

      {/* Transactions card */}
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-muted h-4 w-36 animate-pulse rounded" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-muted h-6 w-24 animate-pulse rounded-md" />
            <div className="flex items-center gap-2">
              <div className="bg-muted h-4 w-24 animate-pulse rounded" />
              <div className="bg-muted h-5 w-9 animate-pulse rounded-full" />
            </div>
          </div>
        </div>

        <div className="mb-4 flex w-full items-center gap-2">
          <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
            <div className="bg-muted size-6 animate-pulse rounded-md" />
            <div className="bg-muted size-6 animate-pulse rounded-md border-l" />
          </div>
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="border-border inline-flex items-center gap-0 rounded-lg border p-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`bg-muted h-6 w-7 animate-pulse${i > 0 ? " border-l" : ""}`}
                />
              ))}
            </div>
          </div>
          <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
            <div className="bg-muted size-6 animate-pulse rounded-md" />
            <div className="bg-muted size-6 animate-pulse rounded-md border-l" />
          </div>
        </div>

        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="border-border bg-card rounded-lg border px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <div className="bg-muted h-3 w-44 animate-pulse rounded" />
                <div className="bg-muted h-4 w-16 animate-pulse rounded" />
              </div>
              <div className="bg-muted mt-2 h-4 w-36 animate-pulse rounded" />
            </div>
          ))}
        </div>

        <div className="mt-4 flex w-full items-center gap-2">
          <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
            <div className="bg-muted size-6 animate-pulse rounded-md" />
            <div className="bg-muted size-6 animate-pulse rounded-md border-l" />
          </div>
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="border-border inline-flex items-center gap-0 rounded-lg border p-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`bg-muted h-6 w-7 animate-pulse${i > 0 ? " border-l" : ""}`}
                />
              ))}
            </div>
          </div>
          <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
            <div className="bg-muted size-6 animate-pulse rounded-md" />
            <div className="bg-muted size-6 animate-pulse rounded-md border-l" />
          </div>
        </div>
      </div>
    </div>
  );
}
