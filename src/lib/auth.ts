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

export const EMAIL_TAKEN_ERROR =
  "Email is already registered to another account";

type UserRow = typeof users.$inferSelect;

type Identity =
  | { kind: "found"; user: UserRow }
  | { kind: "missing" }
  | { kind: "email_taken" };

// Resolves the Clerk caller to their row, adopting an unclaimed row that matches
// on email. Writes on that adoption path, despite the name-shape. "email_taken"
// is separate from "missing" so the caller is not sent to bootstrap, which would
// reject them for the same reason.
async function resolveIdentity(
  user: AuthUser | null | undefined,
): Promise<Identity> {
  const clerkId = user?.id;
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!clerkId && !email) {
    return { kind: "missing" };
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
    ? rows.find((row) => row.clerkId === clerkId && !row.deletedAt)
    : undefined;
  if (byClerkId) {
    return { kind: "found", user: byClerkId };
  }

  if (!email) {
    return { kind: "missing" };
  }

  const byEmail = rows.find((row) => row.email === email);
  if (!byEmail) {
    return { kind: "missing" };
  }

  // A soft-deleted account still owns its unique email, so it is blocked rather
  // than missing; bootstrap would collide with the same row.
  if (byEmail.deletedAt) {
    return { kind: "email_taken" };
  }

  if (byEmail.clerkId) {
    return byEmail.clerkId === clerkId
      ? { kind: "found", user: byEmail }
      : { kind: "email_taken" };
  }

  if (!clerkId) {
    return { kind: "found", user: byEmail };
  }

  const adopted = await db
    .update(users)
    .set({ clerkId, updatedAt: new Date() })
    .where(
      and(
        eq(users.id, byEmail.id),
        isNull(users.clerkId),
        isNull(users.deletedAt),
      ),
    )
    .returning()
    .then((res) => res[0]);

  if (adopted) {
    return { kind: "found", user: adopted };
  }

  // Someone claimed the row between the read and the write, possibly this same
  // caller in a parallel request, so re-read rather than assume a conflict.
  const claimed = await db
    .select()
    .from(users)
    .where(eq(users.id, byEmail.id))
    .limit(1)
    .then((res) => res[0]);

  if (claimed?.clerkId === clerkId && !claimed.deletedAt) {
    return { kind: "found", user: claimed };
  }

  return { kind: "email_taken" };
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

  const identity = await resolveIdentity(authUser);

  if (identity.kind === "email_taken") {
    return {
      user: null,
      response: NextResponse.json(
        { error: EMAIL_TAKEN_ERROR },
        { status: 409 },
      ),
    } as const;
  }

  if (identity.kind === "missing") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      ),
    } as const;
  }

  return { user: identity.user, response: null } as const;
}
