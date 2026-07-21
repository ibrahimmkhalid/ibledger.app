import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions } from "@/db/schema";
import { clearedBalanceSql, pendingBalanceSql } from "@/db/balances";
import { requireUser } from "@/lib/auth";
import { applySavingsDeficitClamp } from "@/lib/fund-balances";
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
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

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
      );

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

    if (
      Number.isNaN(pullPercentage) ||
      pullPercentage < 0 ||
      pullPercentage > 100
    ) {
      return NextResponse.json(
        { error: "Invalid pullPercentage" },
        { status: 400 },
      );
    }

    const newFund = await db
      .insert(funds)
      .values({
        userId: user.id,
        name: String(data.name),
        isSavings: false,
        pullPercentage,
      })
      .returning();

    return NextResponse.json({ fund: newFund[0] });
  } catch (error) {
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

    if (
      nextPullPercentage !== null &&
      (Number.isNaN(nextPullPercentage) ||
        nextPullPercentage < 0 ||
        nextPullPercentage > 100)
    ) {
      return NextResponse.json(
        { error: "Invalid pullPercentage" },
        { status: 400 },
      );
    }

    const updatedFund = await db
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

    if (!updatedFund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    return NextResponse.json({ fund: updatedFund });
  } catch (error) {
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
