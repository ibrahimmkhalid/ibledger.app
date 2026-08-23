import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { BadRequestError } from "@/app/api/query-params";
import { buildEventFilterConditions } from "@/app/api/transactions/event-filters";
import { requireUser } from "@/lib/auth";

/**
 * Settles pending transactions, filtered by the same query params as
 * GET /api/transactions. No params clears the whole ledger. Responds with
 * `{ cleared }`, the number of events settled.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const searchParams = new URL(request.url).searchParams;

    const conditions = buildEventFilterConditions(searchParams, user.id);
    // Whatever the caller filtered on, only pending rows are candidates.
    conditions.push(eq(transactions.isPending, true));

    // A subquery rather than a bound id list: an unfiltered clear would bind
    // two parameters per event against PostgreSQL's cap of 65,535. Built fresh
    // per use so the two calls cannot share a builder.
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

    // Children come back too, and the caller asked how many events moved, so
    // count what the update actually touched.
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
