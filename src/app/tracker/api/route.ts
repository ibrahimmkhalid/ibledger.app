import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { currentUser } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      console.log("API: Unauthorized access attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("API: Fetching data for user", user.id);

    const dbUserEmail = user.emailAddresses[0]?.emailAddress;
    if (!dbUserEmail) {
      console.log("API: User email not found");
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 },
      );
    }
    const dbUser = await db
      .select()
      .from(users)
      .where(eq(users.email, dbUserEmail))
      .limit(1)
      .then((res) => res[0]);
    if (!dbUser) {
      console.log("API: User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = dbUser.id;
    console.log("API: User ID found", userId);

    const data = {
      user: dbUser,
      userId: userId,
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("--> API Route /tracker/api ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
