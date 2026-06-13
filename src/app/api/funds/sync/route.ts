import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

/**
 * PUT /api/funds/sync
 *
 * Atomic bulk-sync of funds: create, update, and soft-delete in one call.
 *
 * Body:
 * ```
 * {
 *   funds: Array<{
 *     id?: number;           // omit for new funds
 *     name: string;
 *     pullPercentage: number;
 *   }>;
 *   deletedIds: number[];    // fund IDs to soft-delete
 * }
 * ```
 */
export async function PUT(request: NextRequest) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    const data = await request.json();

    const fundInputs: {
      id?: number;
      name: string;
      pullPercentage: number;
    }[] = data?.funds ?? [];

    const deletedIds: number[] = data?.deletedIds ?? [];

    // ── Validate inputs ──────────────────────────────────────────────

    for (const f of fundInputs) {
      if (!f.name?.trim()) {
        return NextResponse.json(
          { error: "All funds must have a name" },
          { status: 400 },
        );
      }
      const pp = Number(f.pullPercentage);
      if (Number.isNaN(pp) || pp < 0 || pp > 100) {
        return NextResponse.json(
          { error: `Invalid pull percentage for "${f.name}"` },
          { status: 400 },
        );
      }
    }

    for (const id of deletedIds) {
      if (!id || !Number.isFinite(id)) {
        return NextResponse.json(
          { error: "Invalid fund id in deletedIds" },
          { status: 400 },
        );
      }
    }

    // ── Apply inside a transaction ───────────────────────────────────

    await db.transaction(async (tx) => {
      const now = new Date();

      // 1. Deletions
      for (const id of deletedIds) {
        const target = await tx
          .select({ id: funds.id, isSavings: funds.isSavings })
          .from(funds)
          .where(
            and(
              eq(funds.id, id),
              eq(funds.userId, user.id),
              isNull(funds.deletedAt),
            ),
          )
          .limit(1)
          .then((r) => r[0]);

        if (!target) throw new Error(`Fund ${id} not found`);
        if (target.isSavings) throw new Error("Cannot delete savings fund");

        // Verify zero balance (including pending)
        const balRow = await tx
          .select({
            bal: sql<number>`
              COALESCE(SUM(${transactions.amount}), 0)
            `.as("bal"),
          })
          .from(funds)
          .leftJoin(
            transactions,
            and(
              eq(transactions.userId, user.id),
              eq(transactions.fundId, funds.id),
              eq(transactions.isPosting, true),
              isNull(transactions.deletedAt),
            ),
          )
          .where(
            and(
              eq(funds.id, id),
              eq(funds.userId, user.id),
              isNull(funds.deletedAt),
            ),
          )
          .groupBy(funds.id)
          .limit(1)
          .then((r) => r[0]);

        const bal = Number(balRow?.bal ?? 0);
        if (Math.abs(bal) > 0.005) {
          throw new Error(
            `Fund "${target.id}" has a non-zero balance. Move the money out first.`,
          );
        }

        await tx
          .update(funds)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(funds.id, id));
      }

      // 2. Updates & creates
      for (const f of fundInputs) {
        if (f.id) {
          // ── Update existing ──
          const target = await tx
            .select({ id: funds.id, isSavings: funds.isSavings })
            .from(funds)
            .where(
              and(
                eq(funds.id, f.id),
                eq(funds.userId, user.id),
                isNull(funds.deletedAt),
              ),
            )
            .limit(1)
            .then((r) => r[0]);

          if (!target) throw new Error(`Fund ${f.id} not found`);

          await tx
            .update(funds)
            .set({
              name: f.name.trim(),
              pullPercentage: target.isSavings ? 0 : Number(f.pullPercentage),
              updatedAt: now,
            })
            .where(eq(funds.id, f.id));
        } else {
          // ── Create new fund ──
          await tx.insert(funds).values({
            userId: user.id,
            name: f.name.trim(),
            isSavings: false,
            pullPercentage: Number(f.pullPercentage),
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("API: Error syncing funds", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
