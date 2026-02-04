import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

export async function GET() {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    const userWallets = await db
      .select({
        id: wallets.id,
        name: wallets.name,
        openingAmount: wallets.openingAmount,
        createdAt: wallets.createdAt,
        updatedAt: wallets.updatedAt,
        balance: sql<number>`
          COALESCE(${wallets.openingAmount}, 0) +
          COALESCE(SUM(CASE WHEN ${transactions.isPending} = false THEN ${transactions.amount} ELSE 0 END), 0)
        `.as("balance"),
        balanceWithPending: sql<number>`
          COALESCE(${wallets.openingAmount}, 0) + COALESCE(SUM(${transactions.amount}), 0)
        `.as("balanceWithPending"),
      })
      .from(wallets)
      .leftJoin(
        transactions,
        and(
          eq(transactions.userId, user.id),
          eq(transactions.walletId, wallets.id),
          eq(transactions.isPosting, true),
          isNull(transactions.deletedAt),
        ),
      )
      .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
      .groupBy(
        wallets.id,
        wallets.name,
        wallets.openingAmount,
        wallets.createdAt,
        wallets.updatedAt,
      );

    return NextResponse.json({ wallets: userWallets });
  } catch (error) {
    console.error("API: Error fetching wallets", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    const data = await request.json();

    if (!data?.name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const openingAmount = Number(data.openingAmount ?? 0);

    const newWallet = await db
      .insert(wallets)
      .values({
        userId: user.id,
        name: String(data.name),
        openingAmount,
      })
      .returning();

    return NextResponse.json({ wallet: newWallet[0] });
  } catch (error) {
    console.error("API: Error creating wallet", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    const data = await request.json();

    const walletId = Number(data?.id);
    if (!walletId) {
      return NextResponse.json({ error: "Missing wallet id" }, { status: 400 });
    }

    const selectedWallet = await db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.id, walletId),
          eq(wallets.userId, user.id),
          isNull(wallets.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!selectedWallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const nextName = data?.name ? String(data.name) : selectedWallet.name;
    const nextOpeningAmount =
      data?.openingAmount !== undefined
        ? Number(data.openingAmount)
        : selectedWallet.openingAmount;

    const updatedWallet = await db
      .update(wallets)
      .set({
        name: nextName,
        openingAmount: nextOpeningAmount,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
      .returning();

    return NextResponse.json({ wallet: updatedWallet[0] });
  } catch (error) {
    console.error("API: Error updating wallet", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await currentUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUserWithDB(authUser);
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Call POST /api/bootstrap first." },
        { status: 400 },
      );
    }

    const data = await request.json();

    const walletId = Number(data?.id);
    if (!walletId) {
      return NextResponse.json({ error: "Missing wallet id" }, { status: 400 });
    }

    const selectedWallet = await db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.id, walletId),
          eq(wallets.userId, user.id),
          isNull(wallets.deletedAt),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (!selectedWallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const walletBalanceRow = await db
      .select({
        balanceWithPending: sql<number>`
          COALESCE(${wallets.openingAmount}, 0) + COALESCE(SUM(${transactions.amount}), 0)
        `.as("balanceWithPending"),
      })
      .from(wallets)
      .leftJoin(
        transactions,
        and(
          eq(transactions.userId, user.id),
          eq(transactions.walletId, wallets.id),
          eq(transactions.isPosting, true),
          isNull(transactions.deletedAt),
        ),
      )
      .where(
        and(
          eq(wallets.id, walletId),
          eq(wallets.userId, user.id),
          isNull(wallets.deletedAt),
        ),
      )
      .groupBy(wallets.id, wallets.openingAmount)
      .limit(1)
      .then((res) => res[0]);

    const bal = Number(walletBalanceRow?.balanceWithPending ?? 0);
    if (Math.abs(bal) > 1e-9) {
      return NextResponse.json(
        {
          error:
            "Wallet has a non-zero balance. Move the money to another wallet, then try again.",
        },
        { status: 400 },
      );
    }

    const deletedWallet = await db
      .update(wallets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(wallets.id, walletId))
      .returning();

    return NextResponse.json({ wallet: deletedWallet[0] });
  } catch (error) {
    console.error("API: Error deleting wallet", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
