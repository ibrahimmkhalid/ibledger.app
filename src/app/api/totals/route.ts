import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
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

    const walletTotals = await db
      .select({
        id: wallets.id,
        name: wallets.name,
        balance: sql<number>`
          COALESCE(${wallets.openingAmount}, 0) +
          COALESCE(SUM(CASE WHEN ${transactions.isPending} = false THEN ${transactions.amount} ELSE 0 END), 0)
        `.as("balance"),
        balanceWithPending: sql<number>`
          COALESCE(${wallets.openingAmount}, 0) + COALESCE(SUM(${transactions.amount}), 0)
        `.as("balanceWithPending"),
      })
      .from(wallets)
      .leftJoin(
        transactions,
        and(
          eq(transactions.userId, user.id),
          eq(transactions.walletId, wallets.id),
          eq(transactions.isPosting, true),
          isNull(transactions.deletedAt),
        ),
      )
      .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
      .groupBy(wallets.id, wallets.name, wallets.openingAmount);

    const fundTotals = await db
      .select({
        id: funds.id,
        name: funds.name,
        isSavings: funds.isSavings,
        pullPercentage: funds.pullPercentage,
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
      );

    const fundTotalsWithRaw = fundTotals.map((f) => ({
      ...f,
      rawBalance: Number(f.balance),
      rawBalanceWithPending: Number(f.balanceWithPending),
    }));

    const deficitCleared = fundTotalsWithRaw
      .filter((f) => !Boolean(f.isSavings))
      .reduce((acc, f) => acc + Math.max(0, -Number(f.rawBalance)), 0);

    const deficitWithPending = fundTotalsWithRaw
      .filter((f) => !Boolean(f.isSavings))
      .reduce(
        (acc, f) => acc + Math.max(0, -Number(f.rawBalanceWithPending)),
        0,
      );

    const fundTotalsDisplay = fundTotalsWithRaw.map((f) => {
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

    const grandTotal = walletTotals.reduce(
      (acc: number, w: { balance: number }) => acc + Number(w.balance),
      0,
    );

    const grandTotalWithPending = walletTotals.reduce(
      (acc: number, w: { balanceWithPending: number }) =>
        acc + Number(w.balanceWithPending),
      0,
    );

    return NextResponse.json({
      grandTotal,
      grandTotalWithPending,
      wallets: walletTotals,
      funds: fundTotalsDisplay,
    });
  } catch (error) {
    console.error("API: Error computing totals", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
