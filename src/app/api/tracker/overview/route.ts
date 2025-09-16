import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/index";
import { wallets, accounts, transactions } from "@/db/schema";
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

    const accountsInfo = await db
      .select({ name: accounts.name, amount: accounts.amount })
      .from(accounts)
      .where(eq(accounts.userId, user.id));

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
        walletName: accounts.name,
      })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.walletId))
      .where(eq(transactions.userId, user.id))
      .orderBy(desc(transactions.createdAt))
      .limit(10);

    const data = {
      user: user,
      wallets: walletsInfo,
      accounts: accountsInfo,
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
