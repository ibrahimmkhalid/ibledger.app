import { asc } from "drizzle-orm";

import { funds } from "@/db/schema";

/** Savings last, everything else by id. Spread it: `.orderBy(...FUND_DISPLAY_ORDER)`. */
export const FUND_DISPLAY_ORDER = [
  asc(funds.isSavings),
  asc(funds.id),
] as const;
