import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
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

export async function currentUserWithDB(user: AuthUser | null | undefined) {
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
