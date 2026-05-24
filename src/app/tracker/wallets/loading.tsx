export default function WalletsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="bg-muted h-8 w-24 animate-pulse rounded-md" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted h-9 w-20 animate-pulse rounded-md" />
          <div className="bg-muted h-9 w-28 animate-pulse rounded-md" />
        </div>
      </div>

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
    </div>
  );
}
