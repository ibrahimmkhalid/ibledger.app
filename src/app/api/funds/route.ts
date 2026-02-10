import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

export async function GET() {
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

    const userFundsRaw = await db
      .select({
        id: funds.id,
        name: funds.name,
        isSavings: funds.isSavings,
        pullPercentage: funds.pullPercentage,
        openingAmount: funds.openingAmount,
        createdAt: funds.createdAt,
        updatedAt: funds.updatedAt,
        balance: sql<number>`
          COALESCE(${funds.openingAmount}, 0) +
          COALESCE(SUM(CASE WHEN ${transactions.isPending} = false THEN ${transactions.amount} ELSE 0 END), 0)
        `.as("balance"),
        balanceWithPending: sql<number>`
          COALESCE(${funds.openingAmount}, 0) + COALESCE(SUM(${transactions.amount}), 0)
        `.as("balanceWithPending"),
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
        funds.openingAmount,
        funds.createdAt,
        funds.updatedAt,
      );

    // Display rule:
    // - Non-savings funds are visually clamped at 0
    // - Savings absorbs all deficits from clamped funds (and may go negative)
    const withRaw = userFundsRaw.map((f) => ({
      ...f,
      rawBalance: Number(f.balance),
      rawBalanceWithPending: Number(f.balanceWithPending),
    }));

    const deficitCleared = withRaw
      .filter((f) => !Boolean(f.isSavings))
      .reduce((acc, f) => acc + Math.max(0, -Number(f.rawBalance)), 0);

    const deficitWithPending = withRaw
      .filter((f) => !Boolean(f.isSavings))
      .reduce(
        (acc, f) => acc + Math.max(0, -Number(f.rawBalanceWithPending)),
        0,
      );

    const userFunds = withRaw.map((f) => {
      const balance = f.isSavings
        ? f.rawBalance - deficitCleared
        : Math.max(0, f.rawBalance);
      const balanceWithPending = f.isSavings
        ? f.rawBalanceWithPending - deficitWithPending
        : Math.max(0, f.rawBalanceWithPending);

      return {
        ...f,
        balance,
        balanceWithPending,
      };
    });

    return NextResponse.json({ funds: userFunds });
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

    if (!data?.name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const openingAmount = Number(data.openingAmount ?? 0);
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
        openingAmount,
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

    const fundId = Number(data?.id);
    if (!fundId) {
      return NextResponse.json({ error: "Missing fund id" }, { status: 400 });
    }

    const selectedFund = await db
      .select()
      .from(funds)
      .where(
        and(
          eq(funds.id, fundId),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!selectedFund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const nextName = data?.name ? String(data.name) : selectedFund.name;
    const nextOpeningAmount =
      data?.openingAmount !== undefined
        ? Number(data.openingAmount)
        : selectedFund.openingAmount;

    const nextPullPercentage =
      data?.pullPercentage !== undefined
        ? Number(data.pullPercentage)
        : Number(selectedFund.pullPercentage ?? 0);

    if (
      Number.isNaN(nextPullPercentage) ||
      nextPullPercentage < 0 ||
      nextPullPercentage > 100
    ) {
      return NextResponse.json(
        { error: "Invalid pullPercentage" },
        { status: 400 },
      );
    }

    const updatedFund = await db
      .update(funds)
      .set({
        name: nextName,
        openingAmount: nextOpeningAmount,
        pullPercentage: selectedFund.isSavings ? 0 : nextPullPercentage,
        updatedAt: new Date(),
      })
      .where(eq(funds.id, fundId))
      .returning();

    return NextResponse.json({ fund: updatedFund[0] });
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

    const fundId = Number(data?.id);
    if (!fundId) {
      return NextResponse.json({ error: "Missing fund id" }, { status: 400 });
    }

    const selectedFund = await db
      .select()
      .from(funds)
      .where(
        and(
          eq(funds.id, fundId),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!selectedFund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    if (selectedFund.isSavings) {
      return NextResponse.json(
        { error: "Cannot delete savings fund" },
        { status: 400 },
      );
    }

    const fundBalanceRow = await db
      .select({
        balanceWithPending: sql<number>`
          COALESCE(${funds.openingAmount}, 0) + COALESCE(SUM(${transactions.amount}), 0)
        `.as("balanceWithPending"),
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
          eq(funds.id, fundId),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      )
      .groupBy(funds.id, funds.openingAmount)
      .limit(1)
      .then((res) => res[0]);

    const bal = Number(fundBalanceRow?.balanceWithPending ?? 0);
    if (Math.abs(bal) > 1e-9) {
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
      .where(eq(funds.id, fundId))
      .returning();

    return NextResponse.json({ fund: deletedFund[0] });
  } catch (error) {
    console.error("API: Error deleting fund", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
