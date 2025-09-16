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
  const dbUserEmail = user.emailAddresses[0]?.emailAddress;
  if (!dbUserEmail) {
    return null;
  }
  const dbUser = await db
    .select()
    .from(users)
    .where(eq(users.email, dbUserEmail))
    .limit(1)
    .then((res) => res[0]);
  if (!dbUser) {
    return null;
  }
  return dbUser;
}
