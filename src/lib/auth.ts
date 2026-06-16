import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { testUser } from "./test_user";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";

type AuthUser = {
  id?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }>;
};

export async function currentUser() {
  if (process.env.DEV_TESTING === "true") {
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

  if (clerkId && email) {
    const userRows = await db
      .select()
      .from(users)
      .where(or(eq(users.clerkId, clerkId), eq(users.email, email)))
      .limit(2);

    const byClerkId = userRows.find((row) => row.clerkId === clerkId);

    if (byClerkId) {
      return byClerkId;
    }

    const byEmail = userRows.find((row) => row.email === email);
    if (!byEmail) {
      return null;
    }

    if (!byEmail.clerkId) {
      const updated = await db
        .update(users)
        .set({ clerkId, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id))
        .returning()
        .then((res) => res[0]);

      return updated ?? byEmail;
    }

    return byEmail;
  }

  if (clerkId) {
    const byClerkId = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)
      .then((res) => res[0]);

    return byClerkId ?? null;
  }

  if (!email) {
    return null;
  }

  const byEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .then((res) => res[0]);

  if (!byEmail) {
    return null;
  }

  if (clerkId && !byEmail.clerkId) {
    const updated = await db
      .update(users)
      .set({ clerkId, updatedAt: new Date() })
      .where(eq(users.id, byEmail.id))
      .returning()
      .then((res) => res[0]);

    return updated ?? byEmail;
  }

  return byEmail;
}
