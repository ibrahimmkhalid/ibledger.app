import { NextRequest, NextResponse } from "next/server";
import { currentUser, currentUserWithDB } from "@/lib/auth";
import { db } from "@/db";
import { wallets } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/user/[id]/wallets">,
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

    const userWallets = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id));

    return NextResponse.json({
      wallets: userWallets,
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
  ctx: RouteContext<"/api/user/[id]/wallets">,
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

    const newWallet = await db
      .insert(wallets)
      .values({
        userId: user.id,
        name: data.name,
        amount: data.amount,
      })
      .returning();

    return NextResponse.json({
      wallet: newWallet,
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
  ctx: RouteContext<"/api/user/[id]/wallets">,
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

    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, data.id))
      .where(eq(wallets.userId, user.id));

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }

    if (wallet.amount > 0) {
      return NextResponse.json(
        { error: "Wallet has balance" },
        { status: 400 },
      );
    }

    const deletedWallet = await db
      .delete(wallets)
      .where(eq(wallets.id, data.id))
      .returning();

    return NextResponse.json({
      wallet: deletedWallet,
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
  ctx: RouteContext<"/api/user/account/[id]/settings/wallets">,
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

    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, data.id))
      .where(eq(wallets.userId, user.id));

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }

    const updatedWallet = await db
      .update(wallets)
      .set({
        name: data.name,
        amount: data.amount,
      })
      .where(eq(wallets.id, data.id))
      .returning();

    return NextResponse.json({
      wallet: updatedWallet,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
