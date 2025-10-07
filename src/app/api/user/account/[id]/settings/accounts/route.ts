import { NextRequest, NextResponse } from "next/server";
import { currentUser, currentUserWithDB } from "@/lib/auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/user/account/[id]/settings/accounts">,
) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const checkUser = await ctx.params;
    const checkId = Number(checkUser.id);
    if (user.id !== checkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id));

    return NextResponse.json({
      accounts: userAccounts,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/user/account/[id]/settings/accounts">,
) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const checkUser = await ctx.params;
    const checkId = Number(checkUser.id);
    if (user.id !== checkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    const newAccount = await db
      .insert(accounts)
      .values({
        userId: user.id,
        name: data.name,
        amount: data.amount,
      })
      .returning();

    return NextResponse.json({
      account: newAccount,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/user/account/[id]/settings/accounts">,
) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const checkUser = await ctx.params;
    const checkId = Number(checkUser.id);
    if (user.id !== checkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, data.id))
      .where(eq(accounts.userId, user.id));

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    if (account.amount > 0) {
      return NextResponse.json(
        { error: "Account has balance" },
        { status: 400 },
      );
    }

    const deletedAccount = await db
      .delete(accounts)
      .where(eq(accounts.id, data.id))
      .returning();

    return NextResponse.json({
      account: deletedAccount,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/user/account/[id]/settings/accounts">,
) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const checkUser = await ctx.params;
    const checkId = Number(checkUser.id);
    if (user.id !== checkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, data.id))
      .where(eq(accounts.userId, user.id));

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    const updatedAccount = await db
      .update(accounts)
      .set({
        name: data.name,
        amount: data.amount,
      })
      .where(eq(accounts.id, data.id))
      .returning();

    return NextResponse.json({
      account: updatedAccount,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
