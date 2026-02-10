import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

export async function POST() {
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

    await db
      .update(transactions)
      .set({ isPending: false, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.isPending, true),
          isNull(transactions.deletedAt),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("API: Error clearing pending transactions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
