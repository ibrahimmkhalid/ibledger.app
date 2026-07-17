import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

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
