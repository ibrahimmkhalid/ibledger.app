import { sql } from "drizzle-orm";

import { transactions } from "@/db/schema";

// A balance is the sum of a wallet's or fund's posting amounts. These two
// fragments are the ledger's definition of "how much money is here", so they
// live in one place rather than being retyped at every aggregate. Callers add
// their own .as(alias); the query still has to select/join transactions.

// Cleared balance: pending postings excluded.
export function clearedBalanceSql() {
  return sql<number>`COALESCE(SUM(CASE WHEN ${transactions.isPending} = false THEN ${transactions.amount} ELSE 0 END), 0)`;
}

// Balance including pending postings.
export function pendingBalanceSql() {
  return sql<number>`COALESCE(SUM(${transactions.amount}), 0)`;
}
