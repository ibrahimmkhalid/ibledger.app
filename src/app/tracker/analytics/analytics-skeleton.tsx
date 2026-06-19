import { LoadingBlock } from "@/app/tracker/components/loading-skeletons";

function SkeletonStatCard() {
  return (
    <div className="tracker-skeleton-panel border-border bg-card rounded-lg border p-3">
      <LoadingBlock className="h-3.5 w-20 rounded" />
      <LoadingBlock className="mt-3 h-6 w-28 rounded" />
      <LoadingBlock className="mt-2 h-3 w-24 rounded" />
    </div>
  );
}

function SkeletonChartCard() {
  return (
    <div className="tracker-skeleton-panel border-border bg-card rounded-lg border p-4">
      <LoadingBlock className="h-4 w-40 rounded" />
      <LoadingBlock className="mt-2 h-3 w-56 max-w-full rounded" />
      <LoadingBlock className="mt-4 h-72 w-full rounded-md" />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <LoadingBlock className="h-7 w-32 rounded-md" />
          <LoadingBlock className="h-3.5 w-72 max-w-full rounded" />
        </div>
        <LoadingBlock className="h-8 w-24 rounded-md" />
      </div>

      <div className="tracker-skeleton-panel border-border bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <LoadingBlock className="h-4 w-16 rounded" />
            <LoadingBlock className="h-3 w-32 rounded" />
          </div>
          <LoadingBlock className="h-7 w-16 rounded-md" />
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

      <div className="tracker-skeleton-panel border-border bg-card rounded-lg border p-4">
        <LoadingBlock className="h-4 w-44 rounded" />
        <LoadingBlock className="mt-2 h-3 w-64 max-w-full rounded" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <LoadingBlock className="h-4 w-24 rounded" />
              <LoadingBlock className="h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
