import { NextResponse, NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const pageParam = new URL(request.url).searchParams.get("page");
    const page = pageParam ? parseInt(pageParam) : 0;

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

    const pageSize = 20;

    const pagedTransactions = await db
      .select({
        id: transactions.id,
        parentId: transactions.parentId,
        isPosting: transactions.isPosting,
        isPending: transactions.isPending,
        amount: transactions.amount,
        description: transactions.description,
        occurredAt: transactions.occurredAt,
        fundName: funds.name,
        walletName: wallets.name,
      })
      .from(transactions)
      .leftJoin(funds, eq(funds.id, transactions.fundId))
      .leftJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(
        and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)),
      )
      .offset(page * pageSize)
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(pageSize);

    const count = pagedTransactions.length;

    return NextResponse.json({
      data: pagedTransactions,
      currentPage: page,
      nextPage: count === pageSize ? page + 1 : -1,
    });
  } catch (error) {
    console.error("API: Error fetching tracker transactions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
