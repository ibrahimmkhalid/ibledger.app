import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function POST() {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

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
