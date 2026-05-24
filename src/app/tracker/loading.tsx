export default function TrackerLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-col gap-6">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-muted h-8 w-32 animate-pulse rounded-md" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-muted h-9 w-20 animate-pulse rounded-md" />
            <div className="bg-muted h-9 w-32 animate-pulse rounded-md" />
            <div className="bg-muted h-9 w-24 animate-pulse rounded-md" />
          </div>
        </div>

        {/* Grand total card */}
        <div className="border-border bg-card rounded-xl border p-6">
          <div className="bg-muted mb-3 h-4 w-24 animate-pulse rounded" />
          <div className="bg-muted h-7 w-36 animate-pulse rounded" />
        </div>

        {/* Two-column grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="border-border bg-card rounded-xl border p-6">
            <div className="bg-muted mb-4 h-4 w-20 animate-pulse rounded" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                  <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="border-border bg-card rounded-xl border p-6">
            <div className="bg-muted mb-4 h-4 w-16 animate-pulse rounded" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="bg-muted h-4 w-28 animate-pulse rounded" />
                  <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent transactions card */}
        <div className="border-border bg-card rounded-xl border p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="bg-muted h-4 w-40 animate-pulse rounded" />
            <div className="bg-muted h-9 w-20 animate-pulse rounded-md" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="border-border bg-card rounded-lg border px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="bg-muted h-3 w-40 animate-pulse rounded" />
                  <div className="bg-muted h-4 w-16 animate-pulse rounded" />
                </div>
                <div className="bg-muted mt-2 h-4 w-32 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
