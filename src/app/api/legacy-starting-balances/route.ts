import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import { currentUser, currentUserWithDB } from "@/lib/auth";

const TOLERANCE = 0.005;

type AllocationInput = {
  walletId: unknown;
  fundId: unknown;
  amount: unknown;
};

function centsLike(n: number) {
  return Math.round(n * 100) / 100;
}

function near(a: number, b: number) {
  return Math.abs(centsLike(a) - centsLike(b)) <= TOLERANCE;
}

function addTo(map: Map<number, number>, id: number, amount: number) {
  map.set(id, (map.get(id) ?? 0) + amount);
}

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

    const [walletRows, fundRows] = await Promise.all([
      db
        .select({
          id: wallets.id,
          name: wallets.name,
          legacyAmount: wallets.openingAmount,
        })
        .from(wallets)
        .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt))),
      db
        .select({
          id: funds.id,
          name: funds.name,
          isSavings: funds.isSavings,
          legacyAmount: funds.openingAmount,
        })
        .from(funds)
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt))),
    ]);

    const walletTotal = walletRows.reduce(
      (acc, wallet) => acc + Number(wallet.legacyAmount ?? 0),
      0,
    );
    const fundTotal = fundRows.reduce(
      (acc, fund) => acc + Number(fund.legacyAmount ?? 0),
      0,
    );

    return NextResponse.json({
      required:
        walletRows.some(
          (wallet) => Math.abs(Number(wallet.legacyAmount)) > 0,
        ) || fundRows.some((fund) => Math.abs(Number(fund.legacyAmount)) > 0),
      wallets: walletRows,
      funds: fundRows,
      walletTotal,
      fundTotal,
      totalsMatch: near(walletTotal, fundTotal),
    });
  } catch (error) {
    console.error("API: Error fetching legacy balances", error);
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

    const body = await request.json();
    const source = body?.source === "funds" ? "funds" : "wallets";
    const inputs: AllocationInput[] = Array.isArray(body?.entries)
      ? body.entries
      : [];

    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "Add at least one migration line" },
        { status: 400 },
      );
    }

    const [walletRows, fundRows] = await Promise.all([
      db
        .select({
          id: wallets.id,
          name: wallets.name,
          legacyAmount: wallets.openingAmount,
        })
        .from(wallets)
        .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt))),
      db
        .select({
          id: funds.id,
          name: funds.name,
          legacyAmount: funds.openingAmount,
        })
        .from(funds)
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt))),
    ]);

    const walletIds = new Set(walletRows.map((wallet) => wallet.id));
    const fundIds = new Set(fundRows.map((fund) => fund.id));
    const walletLegacy = new Map(
      walletRows.map((wallet) => [wallet.id, Number(wallet.legacyAmount ?? 0)]),
    );
    const fundLegacy = new Map(
      fundRows.map((fund) => [fund.id, Number(fund.legacyAmount ?? 0)]),
    );

    const walletTotal = walletRows.reduce(
      (acc, wallet) => acc + Number(wallet.legacyAmount ?? 0),
      0,
    );
    const fundTotal = fundRows.reduce(
      (acc, fund) => acc + Number(fund.legacyAmount ?? 0),
      0,
    );
    const hasWalletLegacy = walletRows.some(
      (wallet) => Math.abs(Number(wallet.legacyAmount ?? 0)) > TOLERANCE,
    );
    const hasFundLegacy = fundRows.some(
      (fund) => Math.abs(Number(fund.legacyAmount ?? 0)) > TOLERANCE,
    );

    const parsed = inputs.map((input) => {
      const walletId = Number(input.walletId);
      const fundId = Number(input.fundId);
      const amount = Number(input.amount);

      if (!walletId || !walletIds.has(walletId)) {
        throw new Error("One or more wallets are invalid");
      }

      if (!fundId || !fundIds.has(fundId)) {
        throw new Error("One or more funds are invalid");
      }

      if (!Number.isFinite(amount) || Math.abs(amount) <= TOLERANCE) {
        throw new Error("Migration amounts must be non-zero numbers");
      }

      return { walletId, fundId, amount: centsLike(amount) };
    });

    const byWallet = new Map<number, number>();
    const byFund = new Map<number, number>();
    for (const entry of parsed) {
      addTo(byWallet, entry.walletId, entry.amount);
      addTo(byFund, entry.fundId, entry.amount);
    }

    const exactTwoSided =
      hasWalletLegacy && hasFundLegacy && near(walletTotal, fundTotal);

    if (exactTwoSided || source === "wallets" || !hasFundLegacy) {
      for (const [walletId, amount] of walletLegacy) {
        if (!near(byWallet.get(walletId) ?? 0, amount)) {
          return NextResponse.json(
            { error: "Wallet allocations must match the legacy wallet totals" },
            { status: 400 },
          );
        }
      }
    }

    if (exactTwoSided || source === "funds" || !hasWalletLegacy) {
      for (const [fundId, amount] of fundLegacy) {
        if (!near(byFund.get(fundId) ?? 0, amount)) {
          return NextResponse.json(
            { error: "Fund allocations must match the legacy fund totals" },
            { status: 400 },
          );
        }
      }
    }

    await db.transaction(async (tx) => {
      const now = new Date();
      const description = "Legacy balance migration";

      if (parsed.length === 1) {
        const entry = parsed[0];
        await tx.insert(transactions).values({
          userId: user.id,
          parentId: null,
          occurredAt: now,
          description,
          isPosting: true,
          isPending: false,
          incomePull: null,
          walletId: entry.walletId,
          fundId: entry.fundId,
          amount: entry.amount,
        });
      } else {
        const parent = await tx
          .insert(transactions)
          .values({
            userId: user.id,
            parentId: null,
            occurredAt: now,
            description,
            isPosting: false,
            isPending: false,
            incomePull: null,
            walletId: null,
            fundId: null,
            amount: 0,
          })
          .returning()
          .then((res) => res[0]);

        await tx.insert(transactions).values(
          parsed.map((entry) => ({
            userId: user.id,
            parentId: parent.id,
            occurredAt: now,
            description: null,
            isPosting: true,
            isPending: false,
            incomePull: null,
            walletId: entry.walletId,
            fundId: entry.fundId,
            amount: entry.amount,
          })),
        );
      }

      await tx
        .update(wallets)
        .set({ openingAmount: 0, updatedAt: now })
        .where(eq(wallets.userId, user.id));

      await tx
        .update(funds)
        .set({ openingAmount: 0, updatedAt: now })
        .where(eq(funds.userId, user.id));
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (
      message.includes("invalid") ||
      message.includes("non-zero") ||
      message.includes("Migration")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("API: Error migrating legacy balances", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
