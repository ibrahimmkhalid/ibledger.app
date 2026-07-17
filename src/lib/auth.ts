import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isDevTestingEnabled } from "./dev-testing";
import { testUser } from "./test_user";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

type AuthUser = {
  id?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }>;
};

export async function currentUser() {
  if (isDevTestingEnabled()) {
    return testUser satisfies AuthUser;
  }

  return await clerkCurrentUser();
}

// Resolves the Clerk caller to their row, adopting an unclaimed row that
// matches on email. Writes, despite the name-shape -- see requireUser.
async function currentUserWithDB(user: AuthUser | null | undefined) {
  const clerkId = user?.id;
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!clerkId && !email) {
    return null;
  }

  const rows = await db
    .select()
    .from(users)
    .where(
      or(
        clerkId ? eq(users.clerkId, clerkId) : undefined,
        email ? eq(users.email, email) : undefined,
      ),
    )
    .limit(2);

  const byClerkId = clerkId
    ? rows.find((row) => row.clerkId === clerkId)
    : undefined;
  if (byClerkId) {
    return byClerkId;
  }

  if (!email) {
    return null;
  }

  const byEmail = rows.find((row) => row.email === email);
  if (!byEmail) {
    return null;
  }

  // Only adopt an email-matched row when it is unclaimed. A row already bound to
  // a different Clerk ID belongs to someone else, and matching on email alone
  // would hand over their ledger.
  if (byEmail.clerkId) {
    return byEmail.clerkId === clerkId ? byEmail : null;
  }

  if (!clerkId) {
    return byEmail;
  }

  const adopted = await db
    .update(users)
    .set({ clerkId, updatedAt: new Date() })
    .where(and(eq(users.id, byEmail.id), isNull(users.clerkId)))
    .returning()
    .then((res) => res[0]);

  return adopted ?? null;
}

// Every route needs the same two steps: an authenticated caller, and the DB row
// that caller maps to. Returns the row, or the response to hand straight back.
export async function requireUser() {
  const authUser = await currentUser();
  if (!authUser) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  const user = await currentUserWithDB(authUser);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      ),
    } as const;
  }

  return { user, response: null } as const;
}
