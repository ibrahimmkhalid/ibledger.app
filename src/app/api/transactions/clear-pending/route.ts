import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { BadRequestError } from "@/app/api/query-params";
import { buildEventFilterConditions } from "@/app/api/transactions/event-filters";
import { requireUser } from "@/lib/auth";

/**
 * POST /api/transactions/clear-pending
 *
 * Settles pending transactions. Takes the same filter query params as
 * GET /api/transactions, so the Transactions page can clear exactly the rows
 * it is showing; with no params it clears the whole ledger, which is what the
 * Overview's "Clear all pending" does.
 *
 * Responds with `{ cleared }` — the number of events settled — so the caller
 * can report what it did.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const searchParams = new URL(request.url).searchParams;

    const conditions = buildEventFilterConditions(searchParams, user.id);
    // Whatever the caller filtered on, only pending rows are candidates.
    conditions.push(eq(transactions.isPending, true));

    // Left as a subquery rather than a list of ids read back into the route.
    // "Clear all pending" sends no filters, so the id list is the whole pending
    // backlog, and it gets bound twice — two parameters per event against
    // PostgreSQL's cap of 65,535, which a big enough backlog would exceed and
    // fail on. Built fresh per use so the two calls can't share a builder.
    const matchingEvents = () =>
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(...conditions));

    // An event's postings carry their own pending flag, so settling the event
    // has to settle its children too or the balances never move.
    const settled = await db
      .update(transactions)
      .set({ isPending: false, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.isPending, true),
          isNull(transactions.deletedAt),
          or(
            inArray(transactions.id, matchingEvents()),
            inArray(transactions.parentId, matchingEvents()),
          ),
        ),
      )
      .returning({ parentId: transactions.parentId });

    // Children come back too; the caller asked how many events moved. Counting
    // what the update actually touched also drops the old assumption that every
    // row the select matched was still there to be written.
    const cleared = settled.filter((row) => row.parentId === null).length;

    return NextResponse.json({ cleared });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("API: Error clearing pending transactions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
