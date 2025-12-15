import { NextRequest, NextResponse } from "next/server";
import { currentUser, currentUserWithDB } from "@/lib/auth";
import { db } from "@/db";
import { funds } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
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
      .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

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
  ctx: { params: Promise<{ id: string }> },
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
  ctx: { params: Promise<{ id: string }> },
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

    const selectedFunds = await db
      .select()
      .from(funds)
      .where(
        and(
          eq(funds.id, data.id),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      );

    if (!selectedFunds || selectedFunds.length === 0) {
      return NextResponse.json({ error: "Fund not found" }, { status: 400 });
    }

    if (selectedFunds.length > 1) {
      //this should not be possible
      return NextResponse.json(
        { error: "Multiple funds found" },
        { status: 400 },
      );
    }

    const selectedFund = selectedFunds[0];

    if (selectedFund.amount > 0) {
      return NextResponse.json({ error: "Fund has balance" }, { status: 400 });
    }

    const deletedFund = await db
      .update(funds)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(funds.id, data.id),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      )
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
  ctx: { params: Promise<{ id: string }> },
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

    const selectedFunds = await db
      .select()
      .from(funds)
      .where(
        and(
          eq(funds.id, data.id),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      );

    if (!selectedFunds || selectedFunds.length === 0) {
      return NextResponse.json({ error: "Fund not found" }, { status: 400 });
    }

    const updatedFund = await db
      .update(funds)
      .set({
        name: data.name,
        amount: data.amount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(funds.id, data.id),
          eq(funds.userId, user.id),
          isNull(funds.deletedAt),
        ),
      )
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
