import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { testUser } from "./test_user";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function currentUser() {
  if (process.env.DEV_TESTING === "true") {
    // Return test user with minimal type casting for dev mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return testUser as any;
  }
  return await clerkCurrentUser();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function currentUserWithDB(user: any) {
  const clerkId = user?.id;
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!clerkId && !email) {
    return null;
  }

  if (clerkId) {
    const byClerkId = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)
      .then((res) => res[0]);

    if (byClerkId) {
      return byClerkId;
    }
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
