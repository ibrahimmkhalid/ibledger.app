"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type {
  TransactionDirectionFilter,
  TransactionIncomeFilter,
  TransactionPendingFilter,
  TransactionsPageFilters,
} from "@/app/tracker/lib/transactions-page-query";

export type MultiSelectOption = {
  id: number;
  name: string;
};

export function parseFilterAmount(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} amount must be zero or greater`);
  }

  return parsed;
}

type SharedCountedFilters = Pick<
  TransactionsPageFilters,
  "search" | "fundIds" | "walletIds" | "minAmount" | "maxAmount"
>;

// Counts the filters shared by the transactions and analytics pages; callers
// add their page-specific filters on top.
export function countActiveSharedFilters(filters: SharedCountedFilters) {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.fundIds.length > 0) count += 1;
  if (filters.walletIds.length > 0) count += 1;
  if (filters.minAmount !== null || filters.maxAmount !== null) count += 1;
  return count;
}

export function countActiveTransactionFilters(
  filters: TransactionsPageFilters,
) {
  let count = countActiveSharedFilters(filters);
  if (filters.pendingStatus !== "all") count += 1;
  if (filters.income !== "all") count += 1;
  if (filters.direction !== "all") count += 1;
  return count;
}

function toggleSelectedId(ids: number[], id: number) {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

export function FilterSearchField(args: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { id, value, onChange } = args;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>Search</Label>
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Description, fund, wallet"
          className="pl-7 sm:pointer-fine:pl-7"
        />
      </div>
    </div>
  );
}

// Compact segmented toggle for mutually-exclusive filter values.
export function SegmentedControl<T extends string>(args: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const { label, value, options, onChange, hint } = args;
  // The option captions repeat across controls ("All", "In"…), so the group
  // must carry the label for the buttons to be unambiguous to screen readers.
  const labelId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={labelId}>{label}</Label>
      <div
        role="group"
        aria-labelledby={labelId}
        className="border-input bg-input/20 dark:bg-input/30 flex h-10 items-center gap-0.5 rounded-md border p-0.5 sm:h-7"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex h-full min-w-0 flex-1 items-center justify-center rounded-sm px-1 text-sm font-medium transition-colors sm:text-xs",
                option.disabled
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint ? (
        <span className="text-muted-foreground text-2xs">{hint}</span>
      ) : (
        <span className="text-2xs invisible" aria-hidden>
          &nbsp;
        </span>
      )}
    </div>
  );
}

export function MultiSelectDropdown(args: {
  label: string;
  allLabel: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const { label, allLabel, options, selectedIds, onChange } = args;
  const searchId = useId();
  // "All"/"1 selected" summaries repeat across dropdowns; naming the trigger
  // by label + summary keeps each one unambiguous to screen readers.
  const labelId = useId();
  const summaryId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      option.name.toLowerCase().includes(query),
    );
  }, [options, search]);

  const summary = useMemo(() => {
    if (selectedIds.length === 0) return allLabel;
    if (selectedIds.length === 1) {
      return (
        options.find((option) => option.id === selectedIds[0])?.name ??
        "1 selected"
      );
    }
    return `${selectedIds.length} selected`;
  }, [allLabel, options, selectedIds]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={labelId}>{label}</Label>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-labelledby={`${labelId} ${summaryId}`}
            className="w-full justify-between px-2 font-normal"
          >
            <span id={summaryId} className="min-w-0 truncate">
              {summary}
            </span>
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="bg-popover text-popover-foreground ring-foreground/10 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg p-2 shadow-md ring-1"
          >
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                id={searchId}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label.toLowerCase()}`}
                className="pl-7"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onChange([])}
                disabled={selectedIds.length === 0}
              >
                Clear
              </Button>
              <div className="text-muted-foreground text-xs">
                {selectedIds.length === 0
                  ? allLabel
                  : `${selectedIds.length} selected`}
              </div>
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto pr-1">
              {filteredOptions.length === 0 ? (
                <div className="text-muted-foreground px-2 py-4 text-center text-xs">
                  No matches.
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = selectedSet.has(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() =>
                        onChange(toggleSelectedId(selectedIds, option.id))
                      }
                      className="hover:bg-muted flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm sm:min-h-7 sm:py-1 sm:text-xs/relaxed"
                    >
                      <span className="min-w-0 truncate">{option.name}</span>
                      <CheckIcon
                        className={cn(
                          "size-3.5 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

// The transactions and analytics pages render the same filter fields inside
// different chrome (a Card vs a bordered div), so the fields are shared and the
// wrapper is not. Analytics uses only the search and amount/account fields; the
// status/type/direction group is transactions-only, because each of those three
// splits an axis the analytics charts already break out. Analytics renders its
// own date-range and detail controls in their place.

type SharedFilterDraft = {
  pendingStatus: TransactionPendingFilter;
  income: TransactionIncomeFilter;
  direction: TransactionDirectionFilter;
  fundIds: number[];
  walletIds: number[];
  minAmount: string;
  maxAmount: string;
};

export function StatusTypeDirectionControls(args: {
  draft: Pick<SharedFilterDraft, "pendingStatus" | "income" | "direction">;
  onPatch: (patch: Partial<SharedFilterDraft>) => void;
}) {
  const { draft, onPatch } = args;

  return (
    <>
      <SegmentedControl<TransactionPendingFilter>
        label="Status"
        value={draft.pendingStatus}
        onChange={(pendingStatus) => onPatch({ pendingStatus })}
        options={[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "cleared", label: "Cleared" },
        ]}
      />
      <SegmentedControl<TransactionIncomeFilter>
        label="Type"
        value={draft.income}
        onChange={(income) => onPatch({ income })}
        options={[
          { value: "all", label: "All" },
          { value: "income", label: "Income" },
          { value: "not_income", label: "Expense" },
        ]}
      />
      <SegmentedControl<TransactionDirectionFilter>
        label="Direction"
        value={draft.direction}
        onChange={(direction) => onPatch({ direction })}
        options={[
          { value: "all", label: "All" },
          { value: "in", label: "In" },
          { value: "out", label: "Out" },
        ]}
      />
    </>
  );
}

export function AmountAndAccountFilters(args: {
  draft: Pick<
    SharedFilterDraft,
    "minAmount" | "maxAmount" | "fundIds" | "walletIds"
  >;
  onPatch: (patch: Partial<SharedFilterDraft>) => void;
  funds: MultiSelectOption[];
  wallets: MultiSelectOption[];
  minAmountId: string;
  maxAmountId: string;
}) {
  const { draft, onPatch, funds, wallets, minAmountId, maxAmountId } = args;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={minAmountId}>Minimum</Label>
        <Input
          id={minAmountId}
          inputMode="decimal"
          value={draft.minAmount}
          onChange={(event) => onPatch({ minAmount: event.target.value })}
          placeholder="$0"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={maxAmountId}>Maximum</Label>
        <Input
          id={maxAmountId}
          inputMode="decimal"
          value={draft.maxAmount}
          onChange={(event) => onPatch({ maxAmount: event.target.value })}
          placeholder="Any"
        />
      </div>

      <div className="xl:col-span-2">
        <MultiSelectDropdown
          label="Funds"
          allLabel="All funds"
          options={funds}
          selectedIds={draft.fundIds}
          onChange={(fundIds) => onPatch({ fundIds })}
        />
      </div>

      <div className="xl:col-span-2">
        <MultiSelectDropdown
          label="Wallets"
          allLabel="All wallets"
          options={wallets}
          selectedIds={draft.walletIds}
          onChange={(walletIds) => onPatch({ walletIds })}
        />
      </div>
    </div>
  );
}
