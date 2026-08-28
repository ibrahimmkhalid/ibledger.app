import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function LoadingBlock({ className }: { className?: string }) {
  return <div className={cn("tracker-skeleton rounded", className)} />;
}

function LoadingPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "tracker-skeleton-panel bg-card ring-foreground/10 rounded-lg px-4 py-4 ring-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PageHeaderSkeleton({
  titleWidth = "w-32",
  subtitleWidth,
  actionWidths = [],
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  actionWidths?: string[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <LoadingBlock className={cn("h-7 rounded-md", titleWidth)} />
        {subtitleWidth ? (
          <LoadingBlock
            className={cn("h-3.5 max-w-full rounded", subtitleWidth)}
          />
        ) : null}
      </div>
      {actionWidths.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {actionWidths.map((width, index) => (
            <LoadingBlock
              key={`${width}-${index}`}
              className={cn("h-11 rounded-md sm:h-7", width)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CardTitleSkeleton({
  titleWidth = "w-36",
  descriptionWidth,
  actionWidths = [],
}: {
  titleWidth?: string;
  descriptionWidth?: string;
  actionWidths?: string[];
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <LoadingBlock className={cn("h-4 rounded", titleWidth)} />
        {descriptionWidth ? (
          <LoadingBlock
            className={cn("h-3 max-w-full rounded", descriptionWidth)}
          />
        ) : null}
      </div>
      {actionWidths.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2">
          {actionWidths.map((width, index) => (
            <LoadingBlock
              key={`${width}-${index}`}
              className={cn("h-9 rounded-md sm:h-7", width)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AmountRowsSkeleton({
  rows,
  marker = false,
}: {
  rows: number;
  marker?: boolean;
}) {
  const labelWidths = ["w-24", "w-32", "w-28", "w-36", "w-20"];
  const valueWidths = ["w-16", "w-20", "w-14", "w-24"];

  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {marker ? (
              <LoadingBlock className="size-3.5 shrink-0 rounded-[3px]" />
            ) : null}
            <LoadingBlock
              className={cn(
                "h-4 max-w-full rounded",
                labelWidths[index % labelWidths.length],
              )}
            />
          </div>
          <LoadingBlock
            className={cn(
              "h-4 shrink-0 rounded",
              valueWidths[index % valueWidths.length],
            )}
          />
        </div>
      ))}
    </div>
  );
}

function EventRowsSkeleton({ rows = 5 }: { rows?: number }) {
  const metaWidths = ["w-40", "w-48", "w-36", "w-44"];
  const titleWidths = ["w-32", "w-44", "w-36", "w-52"];

  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="border-border bg-card rounded-lg border px-3 py-2"
        >
          <div className="flex items-center justify-between gap-4">
            <LoadingBlock
              className={cn(
                "h-3 max-w-full rounded",
                metaWidths[index % metaWidths.length],
              )}
            />
            <LoadingBlock className="h-4 w-16 shrink-0 rounded" />
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <LoadingBlock className="size-3.5 shrink-0 rounded-[3px]" />
            <LoadingBlock
              className={cn(
                "h-4 max-w-full rounded",
                titleWidths[index % titleWidths.length],
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({
  rows,
  columns,
  includeActions = false,
}: {
  rows: number;
  columns: number;
  includeActions?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div
        className="bg-muted/20 grid gap-4 border-b px-3 py-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <LoadingBlock
            key={index}
            className={cn("h-3 rounded", index === 0 ? "w-20" : "w-16")}
          />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center gap-4 px-3 py-3"
            style={{
              gridTemplateColumns: includeActions
                ? `repeat(${columns}, minmax(0, 1fr)) 7rem`
                : `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <LoadingBlock
                key={columnIndex}
                className={cn(
                  "h-4 max-w-full rounded",
                  columnIndex === 0
                    ? rowIndex % 2 === 0
                      ? "w-32"
                      : "w-24"
                    : "w-20 justify-self-end",
                )}
              />
            ))}
            {includeActions ? (
              <div className="flex justify-end gap-2">
                <LoadingBlock className="h-8 w-12 rounded-md" />
                <LoadingBlock className="h-8 w-14 rounded-md" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PaginationSkeleton() {
  return (
    <div className="flex w-full items-center gap-2">
      <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
        <LoadingBlock className="size-10 rounded-md sm:size-6" />
        <LoadingBlock className="size-10 rounded-md border-l sm:size-6" />
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="border-border inline-flex items-center gap-0 rounded-lg border p-0.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingBlock
              key={index}
              className={cn("h-9 w-9 sm:h-6 sm:w-7", index > 0 && "border-l")}
            />
          ))}
        </div>
      </div>
      <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
        <LoadingBlock className="size-10 rounded-md sm:size-6" />
        <LoadingBlock className="size-10 rounded-md border-l sm:size-6" />
      </div>
    </div>
  );
}

function AllocationSliderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-muted/20 h-11 overflow-hidden rounded-md border p-1">
        <div className="flex h-full gap-1">
          <LoadingBlock className="h-full w-[34%] rounded-sm" />
          <LoadingBlock className="h-full w-[22%] rounded-sm" />
          <LoadingBlock className="h-full w-[18%] rounded-sm" />
          <LoadingBlock className="h-full flex-1 rounded-sm" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <LoadingBlock className="size-2.5 shrink-0 rounded-[3px]" />
            <LoadingBlock className="h-3 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton
        titleWidth="w-32"
        actionWidths={["w-20", "w-32", "w-24"]}
      />

      <LoadingPanel className="py-3">
        <div className="flex items-center justify-between gap-4">
          <LoadingBlock className="h-4 w-24 rounded" />
          <LoadingBlock className="h-6 w-36 rounded" />
        </div>
      </LoadingPanel>

      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingPanel>
          <LoadingBlock className="mb-4 h-4 w-20 rounded" />
          <AmountRowsSkeleton rows={3} />
        </LoadingPanel>
        <LoadingPanel>
          <LoadingBlock className="mb-4 h-4 w-16 rounded" />
          <AmountRowsSkeleton rows={4} />
        </LoadingPanel>
      </div>

      <LoadingPanel>
        <div className="mb-4 flex items-center justify-between gap-4">
          <LoadingBlock className="h-4 w-40 rounded" />
          <LoadingBlock className="h-9 w-20 shrink-0 rounded-md" />
        </div>
        <EventRowsSkeleton rows={5} />
      </LoadingPanel>
    </div>
  );
}

export function TransactionsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton
        titleWidth="w-40"
        actionWidths={["w-20", "w-32", "w-24"]}
      />

      <LoadingPanel>
        <CardTitleSkeleton
          titleWidth="w-32"
          descriptionWidth="w-56"
          actionWidths={["w-24"]}
        />

        <div className="my-4 rounded-md border">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <LoadingBlock className="size-4 rounded" />
              <LoadingBlock className="h-4 w-16 rounded" />
            </div>
            <LoadingBlock className="h-3 w-32 rounded" />
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-7">
            <LoadingBlock className="h-14 rounded-md xl:col-span-2" />
            <LoadingBlock className="h-14 rounded-md" />
            <LoadingBlock className="h-14 rounded-md" />
            <LoadingBlock className="h-14 rounded-md xl:col-span-2" />
            <LoadingBlock className="h-14 rounded-md" />
          </div>
        </div>

        <PaginationSkeleton />
        <div className="mt-4">
          <EventRowsSkeleton rows={10} />
        </div>
        <div className="mt-4">
          <PaginationSkeleton />
        </div>
      </LoadingPanel>
    </div>
  );
}

export function SetupSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton titleWidth="w-20" />

      <LoadingPanel>
        <CardTitleSkeleton
          titleWidth="w-16"
          actionWidths={["w-24", "w-20", "w-20"]}
        />
        <div className="mt-4 flex flex-col gap-4">
          <AllocationSliderSkeleton />
          <TableSkeleton rows={5} columns={4} includeActions />
        </div>
      </LoadingPanel>

      <LoadingPanel>
        <CardTitleSkeleton titleWidth="w-20" actionWidths={["w-20", "w-28"]} />
        <div className="mt-4">
          <TableSkeleton rows={4} columns={3} includeActions />
        </div>
      </LoadingPanel>
    </div>
  );
}

export function OnboardingSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton titleWidth="w-28" actionWidths={["w-40"]} />

      <LoadingPanel>
        <CardTitleSkeleton titleWidth="w-20" actionWidths={["w-24"]} />
        <div className="mt-4">
          <TableSkeleton rows={3} columns={1} includeActions />
        </div>
      </LoadingPanel>

      <LoadingPanel>
        <CardTitleSkeleton titleWidth="w-16" actionWidths={["w-20"]} />
        <div className="mt-4">
          <TableSkeleton rows={4} columns={3} includeActions />
        </div>
      </LoadingPanel>
    </div>
  );
}
