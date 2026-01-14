import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { fundFeeds, funds } from "@/db/schema";
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

    const userFunds = await db
      .select({ id: funds.id, kind: funds.kind })
      .from(funds)
      .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

    const incomeFundId = userFunds.find((f) => f.kind === "income")?.id;
    const savingsFundId = userFunds.find((f) => f.kind === "savings")?.id;

    if (!incomeFundId || !savingsFundId) {
      return NextResponse.json(
        {
          error: "Missing income/savings fund. Call POST /api/bootstrap first.",
        },
        { status: 400 },
      );
    }

    const pulls = await db
      .select({
        destFundId: fundFeeds.dest,
        percentage: fundFeeds.feedPercentage,
      })
      .from(fundFeeds)
      .where(eq(fundFeeds.source, incomeFundId));

    const effectivePulls = pulls
      .filter((p) => p.destFundId !== savingsFundId)
      .map((p) => ({
        destFundId: p.destFundId,
        percentage: Number(p.percentage),
      }));

    const sum = effectivePulls.reduce(
      (acc: number, p: { destFundId: number; percentage: number }) =>
        acc + p.percentage,
      0,
    );

    return NextResponse.json({
      incomeFundId,
      savingsFundId,
      pulls: effectivePulls,
      savingsPercentage: 100 - sum,
    });
  } catch (error) {
    console.error("API: Error fetching fund feeds", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
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
    const pulls = Array.isArray(data?.pulls) ? data.pulls : null;
    if (!pulls) {
      return NextResponse.json({ error: "Missing pulls" }, { status: 400 });
    }

    const userFunds = await db
      .select({ id: funds.id, kind: funds.kind })
      .from(funds)
      .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)));

    const incomeFundId = userFunds.find((f) => f.kind === "income")?.id;
    const savingsFundId = userFunds.find((f) => f.kind === "savings")?.id;

    if (!incomeFundId || !savingsFundId) {
      return NextResponse.json(
        {
          error: "Missing income/savings fund. Call POST /api/bootstrap first.",
        },
        { status: 400 },
      );
    }

    const destIds: number[] = [];
    const seenDestIds = new Set<number>();

    const normalized: Array<{ destFundId: number; percentage: number }> =
      pulls.map((p: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pull = p as any;
        const destFundId = Number(pull.destFundId);
        const percentage = Number(pull.percentage);

        if (!destFundId || Number.isNaN(destFundId)) {
          throw new Error("Invalid destFundId");
        }

        if (destFundId === incomeFundId) {
          throw new Error("destFundId cannot be income fund");
        }

        if (destFundId === savingsFundId) {
          throw new Error(
            "Do not set savings explicitly; it is computed as remainder",
          );
        }

        if (percentage < 0 || percentage > 100 || Number.isNaN(percentage)) {
          throw new Error("Invalid percentage");
        }

        if (seenDestIds.has(destFundId)) {
          throw new Error("Duplicate destFundId");
        }

        seenDestIds.add(destFundId);
        destIds.push(destFundId);

        return { destFundId, percentage };
      });

    const sum = normalized.reduce(
      (acc: number, p: { destFundId: number; percentage: number }) =>
        acc + p.percentage,
      0,
    );

    if (sum > 100) {
      return NextResponse.json(
        { error: "Sum of pulls cannot exceed 100" },
        { status: 400 },
      );
    }

    const ownedDests = await db
      .select({ id: funds.id, kind: funds.kind })
      .from(funds)
      .where(
        and(
          eq(funds.userId, user.id),
          inArray(funds.id, destIds),
          isNull(funds.deletedAt),
        ),
      );

    if (ownedDests.length !== destIds.length) {
      return NextResponse.json(
        { error: "One or more dest funds not found" },
        { status: 400 },
      );
    }

    if (ownedDests.some((f) => f.kind === "income")) {
      return NextResponse.json(
        { error: "dest funds cannot include income" },
        { status: 400 },
      );
    }

    // Replace pulls for the income source fund.
    await db.delete(fundFeeds).where(eq(fundFeeds.source, incomeFundId));

    if (normalized.length > 0) {
      await db.insert(fundFeeds).values(
        normalized.map((p: { destFundId: number; percentage: number }) => ({
          source: incomeFundId,
          dest: p.destFundId,
          feedPercentage: p.percentage,
        })),
      );
    }

    return NextResponse.json({
      incomeFundId,
      savingsFundId,
      pulls: normalized,
      savingsPercentage: 100 - sum,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (
      message.startsWith("Invalid") ||
      message.includes("cannot") ||
      message.includes("Duplicate")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("API: Error updating fund feeds", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
