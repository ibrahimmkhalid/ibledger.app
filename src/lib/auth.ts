import { currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { testUser } from "./test_user";

export async function currentUser() {
  if (process.env.DEV_TESTING === "true") {
    // Return test user with minimal type casting for dev mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return testUser as any;
  }
  return await clerkCurrentUser();
}
