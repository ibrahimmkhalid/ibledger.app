import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

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
      .update(users)
      .set({ onboarded: true })
      .where(and(eq(users.id, user.id), isNull(users.deletedAt)));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
