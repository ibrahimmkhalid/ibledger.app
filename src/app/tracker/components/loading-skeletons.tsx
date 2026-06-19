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
        "tracker-skeleton-panel border-border bg-card rounded-lg border p-4",
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
              className={cn("h-9 rounded-md", width)}
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
  actionWidth,
}: {
  titleWidth?: string;
  descriptionWidth?: string;
  actionWidth?: string;
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
      {actionWidth ? (
        <LoadingBlock className={cn("h-8 shrink-0 rounded-md", actionWidth)} />
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
        <LoadingBlock className="size-6 rounded-md" />
        <LoadingBlock className="size-6 rounded-md border-l" />
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="border-border inline-flex items-center gap-0 rounded-lg border p-0.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingBlock
              key={index}
              className={cn("h-6 w-7", index > 0 && "border-l")}
            />
          ))}
        </div>
      </div>
      <div className="border-border flex shrink-0 items-center gap-0 rounded-lg border p-0.5">
        <LoadingBlock className="size-6 rounded-md" />
        <LoadingBlock className="size-6 rounded-md border-l" />
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

      <LoadingPanel className="p-6">
        <LoadingBlock className="mb-3 h-4 w-24 rounded" />
        <LoadingBlock className="h-7 w-36 rounded" />
      </LoadingPanel>

      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingPanel className="p-6">
          <LoadingBlock className="mb-4 h-4 w-20 rounded" />
          <AmountRowsSkeleton rows={3} />
        </LoadingPanel>
        <LoadingPanel className="p-6">
          <LoadingBlock className="mb-4 h-4 w-16 rounded" />
          <AmountRowsSkeleton rows={4} />
        </LoadingPanel>
      </div>

      <LoadingPanel className="p-6">
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

      <LoadingPanel className="p-6">
        <CardTitleSkeleton
          titleWidth="w-32"
          descriptionWidth="w-56"
          actionWidth="w-24"
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

export function FundsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton titleWidth="w-24" actionWidths={["w-20", "w-24"]} />

      <LoadingPanel className="p-6">
        <CardTitleSkeleton titleWidth="w-36" descriptionWidth="w-72" />
        <div className="mt-4">
          <AllocationSliderSkeleton />
        </div>
      </LoadingPanel>

      <LoadingPanel className="p-6">
        <CardTitleSkeleton titleWidth="w-24" actionWidth="w-24" />
        <div className="mt-4">
          <TableSkeleton rows={5} columns={4} includeActions />
        </div>
      </LoadingPanel>
    </div>
  );
}

export function WalletsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton titleWidth="w-24" actionWidths={["w-20", "w-28"]} />

      <LoadingPanel className="p-6">
        <CardTitleSkeleton titleWidth="w-24" />
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
      <PageHeaderSkeleton
        titleWidth="w-28"
        subtitleWidth="w-[30rem]"
        actionWidths={["w-40"]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingPanel className="p-6">
          <CardTitleSkeleton
            titleWidth="w-20"
            descriptionWidth="w-72"
            actionWidth="w-24"
          />
          <div className="mt-4">
            <TableSkeleton rows={3} columns={1} includeActions />
          </div>
        </LoadingPanel>
        <LoadingPanel className="p-6">
          <CardTitleSkeleton
            titleWidth="w-16"
            descriptionWidth="w-72"
            actionWidth="w-20"
          />
          <div className="mt-4">
            <TableSkeleton rows={4} columns={3} includeActions />
          </div>
        </LoadingPanel>
      </div>
    </div>
  );
}

export function MigrationSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <PageHeaderSkeleton
        titleWidth="w-56"
        subtitleWidth="w-[36rem]"
        actionWidths={["w-36"]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingPanel className="p-6">
          <CardTitleSkeleton titleWidth="w-40" />
          <div className="mt-4">
            <TableSkeleton rows={3} columns={3} />
          </div>
        </LoadingPanel>
        <LoadingPanel className="p-6">
          <CardTitleSkeleton titleWidth="w-36" />
          <div className="mt-4">
            <TableSkeleton rows={4} columns={3} />
          </div>
        </LoadingPanel>
      </div>

      <LoadingPanel className="p-6">
        <CardTitleSkeleton titleWidth="w-36" actionWidth="w-24" />
        <div className="mt-4">
          <TableSkeleton rows={4} columns={3} includeActions />
        </div>
      </LoadingPanel>
    </div>
  );
}
