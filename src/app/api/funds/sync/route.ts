import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

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

    for (const f of fundInputs) {
      if (
        f.id !== undefined &&
        f.id !== null &&
        (!Number.isFinite(Number(f.id)) || Number(f.id) <= 0)
      ) {
        return NextResponse.json(
          { error: "Invalid fund id in funds" },
          { status: 400 },
        );
      }
    }

    const updateInputs = fundInputs.filter((fund) => Boolean(fund.id));
    const createInputs = fundInputs.filter((fund) => !fund.id);
    const deletedFundIds = Array.from(new Set(deletedIds));
    const deletedFundIdSet = new Set(deletedFundIds);
    const overlappingFundId = updateInputs
      .map((fund) => Number(fund.id))
      .find((id) => deletedFundIdSet.has(id));

    if (overlappingFundId !== undefined) {
      return NextResponse.json(
        { error: `Fund ${overlappingFundId} cannot be updated and deleted` },
        { status: 400 },
      );
    }

    const touchedFundIds = Array.from(
      new Set([
        ...deletedFundIds,
        ...updateInputs.map((fund) => Number(fund.id)),
      ]),
    );

    // ── Apply inside a transaction ───────────────────────────────────

    await db.transaction(async (tx) => {
      const now = new Date();

      const existingFunds =
        touchedFundIds.length === 0
          ? []
          : await tx
              .select({ id: funds.id, isSavings: funds.isSavings })
              .from(funds)
              .where(
                and(
                  eq(funds.userId, user.id),
                  inArray(funds.id, touchedFundIds),
                  isNull(funds.deletedAt),
                ),
              );

      const existingById = new Map(
        existingFunds.map((fund) => [fund.id, fund]),
      );

      for (const id of deletedFundIds) {
        const target = existingById.get(id);
        if (!target) throw new Error(`Fund ${id} not found`);
        if (target.isSavings) throw new Error("Cannot delete savings fund");
      }

      for (const fund of updateInputs) {
        const id = Number(fund.id);
        if (!existingById.has(id)) throw new Error(`Fund ${id} not found`);
      }

      // Verify zero balance for all deletions in one grouped read.
      const balanceRows =
        deletedFundIds.length === 0
          ? []
          : await tx
              .select({
                fundId: transactions.fundId,
                bal: sql<number>`
              COALESCE(SUM(${transactions.amount}), 0)
            `.as("bal"),
              })
              .from(transactions)
              .where(
                and(
                  eq(transactions.userId, user.id),
                  inArray(transactions.fundId, deletedFundIds),
                  eq(transactions.isPosting, true),
                  isNull(transactions.deletedAt),
                ),
              )
              .groupBy(transactions.fundId);

      const balanceByFundId = new Map<number, number>();
      for (const row of balanceRows) {
        if (row.fundId !== null) {
          balanceByFundId.set(row.fundId, Number(row.bal ?? 0));
        }
      }

      for (const id of deletedFundIds) {
        const bal = balanceByFundId.get(id) ?? 0;
        if (Math.abs(bal) > 0.005) {
          throw new Error(
            `Fund "${id}" has a non-zero balance. Move the money out first.`,
          );
        }
      }

      if (deletedFundIds.length > 0) {
        await tx
          .update(funds)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              eq(funds.userId, user.id),
              inArray(funds.id, deletedFundIds),
              isNull(funds.deletedAt),
            ),
          );
      }

      for (const f of updateInputs) {
        const id = Number(f.id);
        const target = existingById.get(id);
        if (!target) throw new Error(`Fund ${id} not found`);

        await tx
          .update(funds)
          .set({
            name: f.name.trim(),
            pullPercentage: target.isSavings ? 0 : Number(f.pullPercentage),
            updatedAt: now,
          })
          .where(
            and(
              eq(funds.id, id),
              eq(funds.userId, user.id),
              isNull(funds.deletedAt),
            ),
          );
      }

      if (createInputs.length > 0) {
        await tx.insert(funds).values(
          createInputs.map((fund) => ({
            userId: user.id,
            name: fund.name.trim(),
            isSavings: false,
            pullPercentage: Number(fund.pullPercentage),
          })),
        );
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
