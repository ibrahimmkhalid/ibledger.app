import { asc } from "drizzle-orm";

import { funds } from "@/db/schema";

/**
 * One canonical order for every fund list the user sees. Savings goes last —
 * it is the leftover bucket rather than a budget line — and everything else
 * sorts by id, so a fund keeps its place when it is renamed or its share
 * changes. Postgres sorts false before true, so ordering on isSavings pushes
 * savings to the end.
 *
 * Spread it into a query: `.orderBy(...FUND_DISPLAY_ORDER)`.
 */
export const FUND_DISPLAY_ORDER = [
  asc(funds.isSavings),
  asc(funds.id),
] as const;
