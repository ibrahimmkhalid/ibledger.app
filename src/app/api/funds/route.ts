import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions } from "@/db/schema";
import { BadRequestError } from "@/app/api/query-params";
import { clearedBalanceSql, pendingBalanceSql } from "@/db/balances";
import { requireUser } from "@/lib/auth";
import { applySavingsDeficitClamp } from "@/lib/fund-balances";
import { FUND_DISPLAY_ORDER } from "@/lib/fund-order";
import {
  FUND_LOCK_NAMESPACE,
  FUND_SHARE_FIELD,
  FUND_SHARE_RANGE_ERROR,
  FUND_SHARE_SUM_ERROR,
  fundSharesExceedHundred,
  isValidFundShare,
} from "@/lib/fund-shares";
import { holdsMoney } from "@/lib/money";

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const includeSummary = searchParams.get("summary") !== "false";

    const { user, response } = await requireUser();
    if (!user) return response;

    if (!includeSummary) {
      const userFunds = await db
        .select({
          id: funds.id,
          name: funds.name,
          isSavings: funds.isSavings,
          pullPercentage: funds.pullPercentage,
          createdAt: funds.createdAt,
          updatedAt: funds.updatedAt,
        })
        .from(funds)
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)))
        .orderBy(...FUND_DISPLAY_ORDER);

      return NextResponse.json({ funds: userFunds });
    }

    const userFundsRaw = await db
      .select({
        id: funds.id,
        name: funds.name,
        isSavings: funds.isSavings,
        pullPercentage: funds.pullPercentage,
        createdAt: funds.createdAt,
        updatedAt: funds.updatedAt,
        balance: clearedBalanceSql().as("balance"),
        balanceWithPending: pendingBalanceSql().as("balanceWithPending"),
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
      .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)))
      .groupBy(
        funds.id,
        funds.name,
        funds.isSavings,
        funds.pullPercentage,
        funds.createdAt,
        funds.updatedAt,
      )
      .orderBy(...FUND_DISPLAY_ORDER);

    return NextResponse.json({
      funds: applySavingsDeficitClamp(userFundsRaw),
    });
  } catch (error) {
    console.error("API: Error fetching funds", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const data = await request.json();

    if (!data?.name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const pullPercentage =
      data.pullPercentage === undefined ? 0 : Number(data.pullPercentage);

    if (!isValidFundShare(pullPercentage)) {
      return NextResponse.json(
        { error: FUND_SHARE_RANGE_ERROR, field: FUND_SHARE_FIELD },
        { status: 400 },
      );
    }

    // Income allocation rejects a total over 100 when the user later records
    // income, so a fund created past the cap locks them out of the feature with
    // nothing on screen explaining why. Reject it at the point of creation.
    const newFund = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${FUND_LOCK_NAMESPACE}, ${user.id})`,
      );

      const activeFunds = await tx
        .select({
          isSavings: funds.isSavings,
          pullPercentage: funds.pullPercentage,
        })
        .from(funds)
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

      const currentSum = activeFunds.reduce(
        (acc, fund) =>
          fund.isSavings ? acc : acc + Number(fund.pullPercentage ?? 0),
        0,
      );

      if (fundSharesExceedHundred(currentSum + pullPercentage)) {
        throw new BadRequestError(FUND_SHARE_SUM_ERROR, FUND_SHARE_FIELD);
      }

      return tx
        .insert(funds)
        .values({
          userId: user.id,
          name: String(data.name),
          isSavings: false,
          pullPercentage,
        })
        .returning()
        .then((res) => res[0]);
    });

    return NextResponse.json({ fund: newFund });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }

    console.error("API: Error creating fund", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const data = await request.json();

    const fundId = Number(data?.id);
    if (!fundId) {
      return NextResponse.json({ error: "Missing fund id" }, { status: 400 });
    }

    const nextPullPercentage =
      data?.pullPercentage !== undefined ? Number(data.pullPercentage) : null;

    if (nextPullPercentage !== null && !isValidFundShare(nextPullPercentage)) {
      return NextResponse.json(
        { error: FUND_SHARE_RANGE_ERROR, field: FUND_SHARE_FIELD },
        { status: 400 },
      );
    }

    const updatedFund = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${FUND_LOCK_NAMESPACE}, ${user.id})`,
      );

      // Same cap as POST: check the total this edit would leave behind, with
      // the edited fund's own current share swapped out for the new one.
      if (nextPullPercentage !== null) {
        const activeFunds = await tx
          .select({
            id: funds.id,
            isSavings: funds.isSavings,
            pullPercentage: funds.pullPercentage,
          })
          .from(funds)
          .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

        const target = activeFunds.find((fund) => fund.id === fundId);

        // Savings has no share of its own — it takes whatever is left over —
        // so an edit to it can't move the total.
        if (target && !target.isSavings) {
          const resultingSum = activeFunds.reduce((acc, fund) => {
            if (fund.isSavings) return acc;
            if (fund.id === fundId) return acc + nextPullPercentage;
            return acc + Number(fund.pullPercentage ?? 0);
          }, 0);

          if (fundSharesExceedHundred(resultingSum)) {
            throw new BadRequestError(FUND_SHARE_SUM_ERROR, FUND_SHARE_FIELD);
          }
        }
      }

      return tx
        .update(funds)
        .set({
          ...(data?.name ? { name: String(data.name) } : {}),
          pullPercentage:
            nextPullPercentage === null
              ? sql<number>`
                CASE WHEN ${funds.isSavings} THEN 0 ELSE ${funds.pullPercentage} END
              `
              : sql<number>`
                CASE WHEN ${funds.isSavings} THEN 0 ELSE ${nextPullPercentage} END
              `,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(funds.id, fundId),
            eq(funds.userId, user.id),
            isNull(funds.deletedAt),
          ),
        )
        .returning()
        .then((res) => res[0]);
    });

    if (!updatedFund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    return NextResponse.json({ fund: updatedFund });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }

    console.error("API: Error updating fund", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const data = await request.json();

    const fundId = Number(data?.id);
    if (!fundId) {
      return NextResponse.json({ error: "Missing fund id" }, { status: 400 });
    }

    const [selectedFund, fundBalanceRow] = await Promise.all([
      db
        .select({ id: funds.id, isSavings: funds.isSavings })
        .from(funds)
        .where(
          and(
            eq(funds.id, fundId),
            eq(funds.userId, user.id),
            isNull(funds.deletedAt),
          ),
        )
        .limit(1)
        .then((res) => res[0]),
      db
        .select({
          balanceWithPending: pendingBalanceSql().as("balanceWithPending"),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, user.id),
            eq(transactions.fundId, fundId),
            eq(transactions.isPosting, true),
            isNull(transactions.deletedAt),
          ),
        )
        .then((res) => res[0]),
    ]);

    if (!selectedFund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    if (selectedFund.isSavings) {
      return NextResponse.json(
        { error: "Cannot delete savings fund" },
        { status: 400 },
      );
    }

    const bal = Number(fundBalanceRow?.balanceWithPending ?? 0);
    if (holdsMoney(bal)) {
      return NextResponse.json(
        {
          error:
            "Fund has a non-zero balance. Move the money to another fund, then try again.",
        },
        { status: 400 },
      );
    }

    const deletedFund = await db
      .update(funds)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(funds.id, fundId),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      )
      .returning()
      .then((res) => res[0]);

    if (!deletedFund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    return NextResponse.json({ fund: deletedFund });
  } catch (error) {
    console.error("API: Error deleting fund", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
