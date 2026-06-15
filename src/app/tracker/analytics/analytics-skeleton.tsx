function SkeletonStatCard() {
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <div className="bg-muted h-3.5 w-20 animate-pulse rounded" />
      <div className="bg-muted mt-3 h-6 w-28 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-3 w-24 animate-pulse rounded" />
    </div>
  );
}

function SkeletonChartCard() {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="bg-muted h-4 w-40 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-3 w-56 animate-pulse rounded" />
      <div className="bg-muted/40 mt-4 h-72 w-full animate-pulse rounded-md" />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="bg-muted h-7 w-32 animate-pulse rounded-md" />
          <div className="bg-muted h-3.5 w-72 max-w-full animate-pulse rounded" />
        </div>
        <div className="bg-muted h-8 w-24 animate-pulse rounded-md" />
      </div>

      <div className="border-border bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <div className="bg-muted h-4 w-16 animate-pulse rounded" />
            <div className="bg-muted h-3 w-32 animate-pulse rounded" />
          </div>
          <div className="bg-muted h-7 w-16 animate-pulse rounded-md" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      <SkeletonChartCard />

      <div className="grid gap-6 xl:grid-cols-2">
        <SkeletonChartCard />
        <SkeletonChartCard />
      </div>

      <div className="border-border bg-card rounded-lg border p-4">
        <div className="bg-muted h-4 w-44 animate-pulse rounded" />
        <div className="bg-muted mt-2 h-3 w-64 max-w-full animate-pulse rounded" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="bg-muted h-4 w-24 animate-pulse rounded" />
              <div className="bg-muted h-4 w-16 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
