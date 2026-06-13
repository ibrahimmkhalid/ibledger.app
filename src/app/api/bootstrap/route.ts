import { NextResponse } from "next/server";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, users, wallets } from "@/db/schema";
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
      (authUser.fullName as string | undefined)
        ?.replaceAll(" ", "_")
        .toLowerCase() ??
      email;

    const existingRows = await db
      .select()
      .from(users)
      .where(or(eq(users.clerkId, clerkId), eq(users.email, email)))
      .limit(2);

    const existingByClerkId = existingRows.find(
      (row) => row.clerkId === clerkId,
    );
    const existingByEmail = existingRows.find((row) => row.email === email);
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

    const [legacyWallet, legacyFund] = await Promise.all([
      db
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(
            eq(wallets.userId, dbUser.id),
            isNull(wallets.deletedAt),
            sql`${wallets.openingAmount} <> 0`,
          ),
        )
        .limit(1)
        .then((res) => res[0]),
      db
        .select({ id: funds.id })
        .from(funds)
        .where(
          and(
            eq(funds.userId, dbUser.id),
            isNull(funds.deletedAt),
            sql`${funds.openingAmount} <> 0`,
          ),
        )
        .limit(1)
        .then((res) => res[0]),
    ]);

    if (legacyWallet || legacyFund) {
      return NextResponse.json({
        user: dbUser,
        funds: {},
        onboarding: {
          required: false,
        },
        migration: {
          required: true,
          redirectTo: "/tracker/migrate-starting-balances",
        },
        isNewUser: false,
      });
    }

    if (dbUser.onboarded) {
      return NextResponse.json({
        user: dbUser,
        funds: {},
        onboarding: {
          required: false,
        },
        isNewUser: false,
      });
    }

    const hasTransactions = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(eq(transactions.userId, dbUser.id), isNull(transactions.deletedAt)),
      )
      .limit(1)
      .then((res) => res[0]);

    if (hasTransactions) {
      await db
        .update(users)
        .set({ onboarded: true })
        .where(and(eq(users.id, dbUser.id)));
      return NextResponse.json({
        user: dbUser,
        funds: {},
        onboarding: {
          required: false,
        },
        isNewUser: false,
      });
    }

    let savingsFund = await db
      .select({ id: funds.id })
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

    if (!savingsFund) {
      savingsFund = await db
        .insert(funds)
        .values({
          userId: dbUser.id,
          name: "Savings",
          isSavings: true,
          pullPercentage: 0,
        })
        .returning({ id: funds.id })
        .then((res) => res[0]);
    }

    const hasWallets = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, dbUser.id), isNull(wallets.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!hasWallets) {
      await db.insert(wallets).values({
        userId: dbUser.id,
        name: "Bank",
      });
    }

    return NextResponse.json({
      user: dbUser,
      funds: { savingsFundId: savingsFund.id },
      onboarding: {
        required: true,
        redirectTo: "/tracker/onboarding",
      },
      isNewUser: !existing,
    });
  } catch (error) {
    console.error("API: Error bootstrapping user", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
