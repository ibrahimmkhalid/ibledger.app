import { NextResponse, NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/index";
import { users, accounts, transactions } from "@/db/schema";
import { currentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const pageParam = new URL(request.url).searchParams.get("page");
    const page = pageParam ? parseInt(pageParam) : 0;

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

    const pageSize = 20;

    const pagedTransactions = await db
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
      .offset(page * pageSize)
      .orderBy(desc(transactions.createdAt))
      .limit(pageSize);

    const count = pagedTransactions.length;

    return NextResponse.json({
      data: pagedTransactions,
      currentPage: page,
      nextPage: count == pageSize ? page + 1 : -1,
    });
  } catch (error) {
    console.error("API: Error fetching data", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
