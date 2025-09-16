import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/index";
import { users, wallets, accounts, transactions } from "@/db/schema";
import { currentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUserEmail = user.emailAddresses[0]?.emailAddress;
    if (!dbUserEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 },
      );
    }
    const dbUser = await db
      .select()
      .from(users)
      .where(eq(users.email, dbUserEmail))
      .limit(1)
      .then((res) => res[0]);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = dbUser.id;

    const accountsInfo = await db
      .select({ name: accounts.name, amount: accounts.amount })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const walletsInfo = await db
      .select({ name: wallets.name, amount: wallets.amount })
      .from(wallets)
      .where(eq(wallets.userId, userId));

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
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(10);

    const data = {
      user: dbUser,
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
