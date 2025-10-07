import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/index";
import { wallets, funds, transactions } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

export async function GET() {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const fundsInfo = await db
      .select({ name: funds.name, amount: funds.amount })
      .from(funds)
      .where(eq(funds.userId, user.id));

    const walletsInfo = await db
      .select({ name: wallets.name, amount: wallets.amount })
      .from(wallets)
      .where(eq(wallets.userId, user.id));

    const recentTransactions = await db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        withdraw: transactions.withdraw,
        description: transactions.description,
        createdAt: transactions.createdAt,
        walletName: wallets.name,
      })
      .from(transactions)
      .leftJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(eq(transactions.userId, user.id))
      .orderBy(desc(transactions.createdAt))
      .limit(10);

    const data = {
      user: user,
      wallets: walletsInfo,
      funds: fundsInfo,
      recentTransactions: recentTransactions,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("API: Error fetching data", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
