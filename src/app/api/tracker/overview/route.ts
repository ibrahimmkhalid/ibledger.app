import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { funds, transactions, wallets } from "@/db/schema";
import { clearedBalanceSql, pendingBalanceSql } from "@/db/balances";
import { requireUser } from "@/lib/auth";
import { applySavingsDeficitClamp } from "@/lib/fund-balances";
import { FUND_DISPLAY_ORDER } from "@/lib/fund-order";

export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (!user) return response;

    const pageSize = 20;

    const [fundsInfoRaw, walletsInfo, events] = await Promise.all([
      db
        .select({
          id: funds.id,
          name: funds.name,
          isSavings: funds.isSavings,
          pullPercentage: funds.pullPercentage,
          balance: clearedBalanceSql().as("balance"),
          balanceWithPending: pendingBalanceSql().as("balanceWithPending"),
        })
        .from(funds)
        .leftJoin(
          transactions,
          and(
            eq(transactions.userId, user.id),
            eq(transactions.fundId, funds.id),
            eq(transactions.isPosting, true),
            isNull(transactions.deletedAt),
          ),
        )
        .where(and(eq(funds.userId, user.id), isNull(funds.deletedAt)))
        .groupBy(funds.id, funds.name, funds.isSavings, funds.pullPercentage)
        .orderBy(...FUND_DISPLAY_ORDER),
      db
        .select({
          id: wallets.id,
          name: wallets.name,
          balance: clearedBalanceSql().as("balance"),
          balanceWithPending: pendingBalanceSql().as("balanceWithPending"),
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
        .groupBy(wallets.id, wallets.name),
      db
        .select({
          id: transactions.id,
          occurredAt: transactions.occurredAt,
          description: transactions.description,
          amount: transactions.amount,
          parentId: transactions.parentId,
          isPosting: transactions.isPosting,
          isPending: transactions.isPending,
          incomePull: transactions.incomePull,
          walletId: transactions.walletId,
          walletName: wallets.name,
          fundId: transactions.fundId,
          fundName: funds.name,
        })
        .from(transactions)
        .leftJoin(wallets, eq(wallets.id, transactions.walletId))
        .leftJoin(funds, eq(funds.id, transactions.fundId))
        .where(
          and(
            eq(transactions.userId, user.id),
            isNull(transactions.parentId),
            isNull(transactions.deletedAt),
          ),
        )
        .orderBy(desc(transactions.occurredAt), desc(transactions.id))
        .limit(pageSize),
    ]);

    const parentEventIds = events
      .filter((event) => !event.isPosting)
      .map((event) => event.id);
    const children =
      parentEventIds.length === 0
        ? []
        : await db
            .select({
              id: transactions.id,
              parentId: transactions.parentId,
              occurredAt: transactions.occurredAt,
              description: transactions.description,
              isPending: transactions.isPending,
              amount: transactions.amount,
              incomePull: transactions.incomePull,
              walletId: transactions.walletId,
              walletName: wallets.name,
              fundId: transactions.fundId,
              fundName: funds.name,
            })
            .from(transactions)
            .leftJoin(wallets, eq(wallets.id, transactions.walletId))
            .leftJoin(funds, eq(funds.id, transactions.fundId))
            .where(
              and(
                eq(transactions.userId, user.id),
                eq(transactions.isPosting, true),
                inArray(transactions.parentId, parentEventIds),
                isNull(transactions.deletedAt),
              ),
            )
            .orderBy(asc(transactions.id));

    const childrenByParentId = new Map<number, typeof children>();
    for (const child of children) {
      const parentId = child.parentId;
      if (!parentId) {
        continue;
      }

      const list = childrenByParentId.get(parentId) ?? [];
      list.push(child);
      childrenByParentId.set(parentId, list);
    }

    const fundsInfo = applySavingsDeficitClamp(fundsInfoRaw);

    const grandTotal = walletsInfo.reduce(
      (acc, wallet) => acc + Number(wallet.balance),
      0,
    );

    const grandTotalWithPending = walletsInfo.reduce(
      (acc, wallet) => acc + Number(wallet.balanceWithPending),
      0,
    );

    const eventsWithChildren = events.map((event) => ({
      ...event,
      children: childrenByParentId.get(event.id) ?? [],
    }));

    return NextResponse.json({
      grandTotal,
      grandTotalWithPending,
      wallets: walletsInfo,
      funds: fundsInfo,
      events: eventsWithChildren,
      currentPage: 0,
      nextPage: events.length === pageSize ? 1 : -1,
      prevPage: -1,
      totalCount: events.length,
      totalPages: events.length === 0 ? 0 : 1,
      pageSize,
    });
  } catch (error) {
    console.error("API: Error fetching tracker overview", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
