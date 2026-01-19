import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

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

    const fundsInfo = await db
      .select({
        id: funds.id,
        name: funds.name,
        kind: funds.kind,
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
          eq(transactions.status, "posted"),
          eq(transactions.isPosting, true),
          isNull(transactions.deletedAt),
        ),
      )
      .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)))
      .groupBy(funds.id, funds.name, funds.kind, funds.openingAmount);

    const walletsInfo = await db
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
          eq(transactions.status, "posted"),
          eq(transactions.isPosting, true),
          isNull(transactions.deletedAt),
        ),
      )
      .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
      .groupBy(wallets.id, wallets.name, wallets.openingAmount);

    const recentTransactions = await db
      .select({
        id: transactions.id,
        parentId: transactions.parentId,
        isPosting: transactions.isPosting,
        isPending: transactions.isPending,
        status: transactions.status,
        amount: transactions.amount,
        description: transactions.description,
        occurredAt: transactions.occurredAt,
        walletName: wallets.name,
        fundName: funds.name,
      })
      .from(transactions)
      .leftJoin(wallets, eq(wallets.id, transactions.walletId))
      .leftJoin(funds, eq(funds.id, transactions.fundId))
      .where(
        and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(10);

    return NextResponse.json({
      user,
      wallets: walletsInfo,
      funds: fundsInfo,
      recentTransactions,
    });
  } catch (error) {
    console.error("API: Error fetching tracker overview", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
