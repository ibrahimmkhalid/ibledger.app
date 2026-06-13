"use client";

import { useMemo } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { buildPageLinks } from "@/app/tracker/lib/transactions-page-cache";

type TransactionsPaginationProps = {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
};

export function TransactionsPagination({
  page,
  totalPages,
  disabled = false,
  onPageChange,
  className,
}: TransactionsPaginationProps) {
  const pageLinks = useMemo(
    () => buildPageLinks(page, totalPages),
    [page, totalPages],
  );

  const lastPage = Math.max(totalPages - 1, 0);
  const canGoPrev = page > 0;
  const canGoNext = totalPages > 0 && page < lastPage;

  return (
    <nav
      aria-label="Transaction pages"
      className={cn("flex w-full items-center gap-2", className)}
    >
      <div className="border-border flex shrink-0 items-center rounded-lg border p-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !canGoPrev}
          onClick={() => onPageChange(0)}
          aria-label="First page"
          className="rounded-l-md rounded-r-none"
        >
          <ChevronsLeftIcon />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !canGoPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="rounded-l-none rounded-r-md border-l"
        >
          <ChevronLeftIcon />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center">
        <div className="border-border inline-flex items-center overflow-hidden rounded-lg border">
          {pageLinks.length === 0 ? (
            <Button
              variant="secondary"
              size="sm"
              disabled
              aria-current="page"
              className="min-w-7 rounded-none tabular-nums"
            >
              1
            </Button>
          ) : (
            pageLinks.map((link, index) =>
              link === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="text-muted-foreground border-border flex h-6 min-w-7 items-center justify-center px-1 text-sm select-none"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <Button
                  key={link}
                  variant={link === page ? "secondary" : "ghost"}
                  size="sm"
                  disabled={disabled}
                  aria-current={link === page ? "page" : undefined}
                  onClick={() => onPageChange(link)}
                  className="min-w-7 rounded-none tabular-nums"
                >
                  {link + 1}
                </Button>
              ),
            )
          )}
        </div>
      </div>

      <div className="border-border flex shrink-0 items-center rounded-lg border p-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !canGoNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="rounded-l-md rounded-r-none"
        >
          <ChevronRightIcon />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !canGoNext}
          onClick={() => onPageChange(lastPage)}
          aria-label="Last page"
          className="rounded-l-none rounded-r-md border-l"
        >
          <ChevronsRightIcon />
        </Button>
      </div>
    </nav>
  );
}
