import { sql } from "drizzle-orm";

import { transactions } from "@/db/schema";

// The ledger's definition of "how much money is here", in one place. Callers
// add their own .as(alias) and still have to select or join transactions.

// Cleared balance: pending postings excluded.
export function clearedBalanceSql() {
  return sql<number>`COALESCE(SUM(CASE WHEN ${transactions.isPending} = false THEN ${transactions.amount} ELSE 0 END), 0)`;
}

// Balance including pending postings.
export function pendingBalanceSql() {
  return sql<number>`COALESCE(SUM(${transactions.amount}), 0)`;
}
