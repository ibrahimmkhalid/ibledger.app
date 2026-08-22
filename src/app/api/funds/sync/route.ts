import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions } from "@/db/schema";
import {
  parseIdArray,
  parseNullableId,
  parseObjectArray,
  parseRequestJsonObject,
} from "@/app/api/json-body";
import { BadRequestError } from "@/app/api/query-params";
import { pendingBalanceSql } from "@/db/balances";
import { requireUser } from "@/lib/auth";
import {
  FUND_LOCK_NAMESPACE,
  FUND_SHARE_FIELD,
  FUND_SHARE_SUM_ERROR,
  fundShareRangeError,
  fundSharesExceedHundred,
  isValidFundShare,
} from "@/lib/fund-shares";
import { holdsMoney } from "@/lib/money";

type FundSyncInput = {
  id: number | null;
  name: string;
  pullPercentage: number;
};

type FundUpdateInput = FundSyncInput & { id: number };

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
    const { user, response } = await requireUser();
    if (!user) return response;

    const data = await parseRequestJsonObject(request);

    const fundInputs: FundSyncInput[] = parseObjectArray(
      data.funds,
      "funds",
    ).map((entry) => ({
      id: parseNullableId(entry.id, "fund id in funds"),
      name: typeof entry.name === "string" ? entry.name : "",
      pullPercentage: Number(entry.pullPercentage),
    }));

    const deletedIds = parseIdArray(data.deletedIds, "fund id in deletedIds");

    for (const f of fundInputs) {
      if (!f.name.trim()) {
        return NextResponse.json(
          { error: "All funds must have a name" },
          { status: 400 },
        );
      }
      if (!isValidFundShare(f.pullPercentage)) {
        return NextResponse.json(
          { error: fundShareRangeError(f.name), field: FUND_SHARE_FIELD },
          { status: 400 },
        );
      }
    }

    const updateInputs = fundInputs.filter(
      (fund): fund is FundUpdateInput => fund.id !== null,
    );
    const createInputs = fundInputs.filter((fund) => fund.id === null);
    const deletedFundIds = Array.from(new Set(deletedIds));
    const deletedFundIdSet = new Set(deletedFundIds);
    const overlappingFundId = updateInputs
      .map((fund) => fund.id)
      .find((id) => deletedFundIdSet.has(id));

    if (overlappingFundId !== undefined) {
      return NextResponse.json(
        { error: `Fund ${overlappingFundId} cannot be updated and deleted` },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      // Serialise fund writes per user; the lock releases on commit or
      // rollback. See FUND_LOCK_NAMESPACE for why.
      await tx.execute(
        sql`select pg_advisory_xact_lock(${FUND_LOCK_NAMESPACE}, ${user.id})`,
      );

      const now = new Date();

      const activeFunds = await tx
        .select({
          id: funds.id,
          name: funds.name,
          isSavings: funds.isSavings,
          pullPercentage: funds.pullPercentage,
        })
        .from(funds)
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

      const existingById = new Map(activeFunds.map((fund) => [fund.id, fund]));

      for (const id of deletedFundIds) {
        const target = existingById.get(id);
        if (!target) throw new Error(`Fund ${id} not found`);
        if (target.isSavings) throw new Error("Cannot delete savings fund");
      }

      for (const fund of updateInputs) {
        if (!existingById.has(fund.id)) {
          throw new Error(`Fund ${fund.id} not found`);
        }
      }

      // Income allocation reads these percentages back and rejects a sum over
      // 100, so a sync that pushes them past it would lock the user out of
      // recording income with no way to see why. Check the state this sync
      // would leave behind, not just the funds it names.
      const updateById = new Map(updateInputs.map((fund) => [fund.id, fund]));

      let resultingPullSum = 0;
      for (const fund of activeFunds) {
        if (fund.isSavings || deletedFundIdSet.has(fund.id)) continue;
        const update = updateById.get(fund.id);
        resultingPullSum += Number(
          update ? update.pullPercentage : (fund.pullPercentage ?? 0),
        );
      }
      for (const fund of createInputs) {
        resultingPullSum += fund.pullPercentage;
      }

      if (fundSharesExceedHundred(resultingPullSum)) {
        throw new BadRequestError(FUND_SHARE_SUM_ERROR, FUND_SHARE_FIELD);
      }

      // Verify zero balance for all deletions in one grouped read.
      const balanceRows =
        deletedFundIds.length === 0
          ? []
          : await tx
              .select({
                fundId: transactions.fundId,
                bal: pendingBalanceSql().as("bal"),
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
        if (holdsMoney(bal)) {
          const name = existingById.get(id)?.name ?? "This fund";
          throw new Error(
            `"${name}" still holds money (including pending). Move it out before deleting.`,
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
        const target = existingById.get(f.id);
        if (!target) throw new Error(`Fund ${f.id} not found`);

        await tx
          .update(funds)
          .set({
            name: f.name.trim(),
            pullPercentage: target.isSavings ? 0 : f.pullPercentage,
            updatedAt: now,
          })
          .where(
            and(
              eq(funds.id, f.id),
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
            pullPercentage: fund.pullPercentage,
          })),
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }

    // The remaining domain errors thrown inside the transaction ("Fund N not
    // found", "Cannot delete savings fund", non-zero balance) still surface as
    // 500s with their raw message. Pre-existing, and left alone deliberately.
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("API: Error syncing funds", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
