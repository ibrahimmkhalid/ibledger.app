import { NextRequest, NextResponse } from "next/server";
import { currentUser, currentUserWithDB } from "@/lib/auth";
import { db } from "@/db";
import { funds } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/user/[id]/funds">,
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

    const userFunds = await db
      .select()
      .from(funds)
      .where(eq(funds.userId, user.id));

    return NextResponse.json({
      funds: userFunds,
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
  ctx: RouteContext<"/api/user/[id]/funds">,
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

    const newFund = await db
      .insert(funds)
      .values({
        userId: user.id,
        name: data.name,
        amount: data.amount,
      })
      .returning();

    return NextResponse.json({
      fund: newFund,
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
  ctx: RouteContext<"/api/user/[id]/funds">,
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

    const fund = await db
      .select()
      .from(funds)
      .where(eq(funds.id, data.id))
      .where(eq(funds.userId, user.id));

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 400 });
    }

    if (fund.amount > 0) {
      return NextResponse.json({ error: "Fund has balance" }, { status: 400 });
    }

    const deletedFund = await db
      .delete(funds)
      .where(eq(funds.id, data.id))
      .returning();

    return NextResponse.json({
      fund: deletedFund,
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
  ctx: RouteContext<"/api/user/account/[id]/settings/funds">,
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

    const fund = await db
      .select()
      .from(funds)
      .where(eq(funds.id, data.id))
      .where(eq(funds.userId, user.id));

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 400 });
    }

    const updatedFund = await db
      .update(funds)
      .set({
        name: data.name,
        amount: data.amount,
      })
      .where(eq(funds.id, data.id))
      .returning();

    return NextResponse.json({
      fund: updatedFund,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
