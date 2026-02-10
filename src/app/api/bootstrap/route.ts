import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, users } from "@/db/schema";
import { currentUser } from "@/lib/auth";

export async function POST() {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkId = authUser.id as string | undefined;
    const email = authUser.emailAddresses?.[0]?.emailAddress as
      | string
      | undefined;

    if (!clerkId) {
      return NextResponse.json({ error: "Missing clerk id" }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const usernameCandidate =
      (authUser.username as string | undefined) ??
      (authUser.fullName as string | undefined) ??
      email;

    const existingByClerkId = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)
      .then((res) => res[0]);

    const existingByEmail = existingByClerkId
      ? null
      : await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
          .then((res) => res[0]);

    const existing = existingByClerkId ?? existingByEmail;

    const dbUser = existing
      ? await db
          .update(users)
          .set({
            clerkId,
            email,
            username: existing.username ?? usernameCandidate,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning()
          .then((res) => res[0])
      : await db
          .insert(users)
          .values({
            clerkId,
            email,
            username: usernameCandidate,
          })
          .returning()
          .then((res) => res[0]);

    if (!dbUser) {
      return NextResponse.json(
        { error: "Failed to upsert user" },
        { status: 500 },
      );
    }

    const savingsFund = await db
      .select()
      .from(funds)
      .where(
        and(
          eq(funds.userId, dbUser.id),
          eq(funds.isSavings, true),
          isNull(funds.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    const ensuredSavings =
      savingsFund ??
      (await db
        .insert(funds)
        .values({
          userId: dbUser.id,
          name: "Savings",
          isSavings: true,
          pullPercentage: 0,
          openingAmount: 0,
        })
        .returning()
        .then((res) => res[0]));

    return NextResponse.json({
      user: dbUser,
      funds: { savingsFundId: ensuredSavings.id },
    });
  } catch (error) {
    console.error("API: Error bootstrapping user", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
