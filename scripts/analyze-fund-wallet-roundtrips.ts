import "dotenv/config";

import { and, asc, eq, isNull } from "drizzle-orm";

import { funds, transactions, users, wallets } from "../src/db/schema";

type TxRow = {
  id: number;
  userId: number;
  parentId: number | null;
  occurredAt: Date | string;
  description: string | null;
  amount: number;
  isPosting: boolean;
  isPending: boolean;
  walletId: number | null;
  fundId: number | null;
};

type ChildSummary = {
  id: number;
  fundId: number;
  fundName: string;
  walletId: number;
  walletName: string;
  amount: number;
  direction: "in" | "out";
  isPending: boolean;
  isPosting: boolean;
  description: string | null;
  occurredAt: string;
};

type RoundtripMatch = {
  transactionId: number;
  occurredAt: string;
  description: string | null;
  isPending: boolean;
  isPosting: boolean;
  fundId: number;
  fundName: string;
  walletId: number;
  walletName: string;
  amount: number;
  childIn: ChildSummary;
  childOut: ChildSummary;
};

function parseCliArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    if (a.startsWith("--")) {
      const [kRaw, vRaw] = a.slice(2).split("=", 2);
      const key = kRaw?.trim();
      if (!key) continue;

      if (vRaw !== undefined) {
        flags[key] = vRaw;
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }

      continue;
    }

    positional.push(a);
  }

  return { flags, positional };
}

function toDate(input: Date | string): Date {
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${String(input)}`);
  }
  return parsed;
}

function toIsoString(input: Date | string): string {
  return toDate(input).toISOString();
}

function directionOf(amount: number): "in" | "out" {
  return amount >= 0 ? "in" : "out";
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.000001;
}

function isRoundtripPair(childA: TxRow, childB: TxRow): boolean {
  if (childA.isPending || childB.isPending) return false;
  if (childA.fundId === null || childB.fundId === null) return false;
  if (childA.walletId === null || childB.walletId === null) return false;
  if (childA.fundId !== childB.fundId) return false;
  if (childA.walletId !== childB.walletId) return false;
  if (!amountsEqual(childA.amount, childB.amount)) return false;
  if (directionOf(childA.amount) === directionOf(childB.amount)) return false;
  return true;
}

function toChildSummary(
  row: TxRow,
  fundNameById: Map<number, string>,
  walletNameById: Map<number, string>,
): ChildSummary {
  return {
    id: row.id,
    fundId: row.fundId!,
    fundName: fundNameById.get(row.fundId!) ?? `fund#${row.fundId}`,
    walletId: row.walletId!,
    walletName: walletNameById.get(row.walletId!) ?? `wallet#${row.walletId}`,
    amount: Number(row.amount),
    direction: directionOf(Number(row.amount)),
    isPending: Boolean(row.isPending),
    isPosting: Boolean(row.isPosting),
    description: row.description,
    occurredAt: toIsoString(row.occurredAt),
  };
}

function findRoundtripMatches(args: {
  rows: TxRow[];
  fundNameById: Map<number, string>;
  walletNameById: Map<number, string>;
}): RoundtripMatch[] {
  const roots = args.rows.filter((row) => row.parentId === null);
  const childrenByParentId = new Map<number, TxRow[]>();

  for (const row of args.rows) {
    if (row.parentId === null) continue;
    const list = childrenByParentId.get(row.parentId) ?? [];
    list.push(row);
    childrenByParentId.set(row.parentId, list);
  }

  const matches: RoundtripMatch[] = [];

  for (const root of roots) {
    const children = childrenByParentId.get(root.id) ?? [];
    if (children.length !== 2) continue;

    const [childA, childB] = children;
    if (!childA || !childB) continue;
    if (!isRoundtripPair(childA, childB)) continue;

    const childIn = childA.amount >= 0 ? childA : childB;
    const childOut = childA.amount < 0 ? childA : childB;

    matches.push({
      transactionId: root.id,
      occurredAt: toIsoString(root.occurredAt),
      description: root.description,
      isPending: Boolean(root.isPending),
      isPosting: Boolean(root.isPosting),
      fundId: childIn.fundId!,
      fundName:
        args.fundNameById.get(childIn.fundId!) ?? `fund#${childIn.fundId}`,
      walletId: childIn.walletId!,
      walletName:
        args.walletNameById.get(childIn.walletId!) ??
        `wallet#${childIn.walletId}`,
      amount: Math.abs(Number(childIn.amount)),
      childIn: toChildSummary(childIn, args.fundNameById, args.walletNameById),
      childOut: toChildSummary(
        childOut,
        args.fundNameById,
        args.walletNameById,
      ),
    });
  }

  return matches.sort(
    (a, b) =>
      toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime() ||
      a.transactionId - b.transactionId,
  );
}

function printUsage() {
  console.log(`Usage:
  npx tsx scripts/analyze-fund-wallet-roundtrips.ts [--userId 123] [--json]

Finds parent transactions with exactly two non-pending children on the same
fund and wallet, with equal absolute amounts and opposite directions (in/out).

Flags:
  --userId   User to analyze. Required.
  --json     Emit JSON only.
  --help     Show this message
`);
}

async function main() {
  const { flags, positional } = parseCliArgs(process.argv.slice(2));

  if (flags.help === "true" || flags.h === "true") {
    printUsage();
    return;
  }

  const userIdRaw = flags.userId ?? flags.user ?? positional[0];
  const userId = userIdRaw ? Number(userIdRaw) : NaN;
  const jsonMode = flags.json === "true";

  if (!userIdRaw || Number.isNaN(userId)) {
    throw new Error("Missing userId. Usage: npx tsx scripts/analyze-fund-wallet-roundtrips.ts --userId 123");
  }

  const { db } = await import("../src/db");

  const userRows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    throw new Error(`User not found (or deleted): userId=${String(userIdRaw)}`);
  }

  const [txRows, fundRows, walletRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        parentId: transactions.parentId,
        occurredAt: transactions.occurredAt,
        description: transactions.description,
        amount: transactions.amount,
        isPosting: transactions.isPosting,
        isPending: transactions.isPending,
        walletId: transactions.walletId,
        fundId: transactions.fundId,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
      .orderBy(asc(transactions.occurredAt), asc(transactions.id)) as Promise<TxRow[]>,
    db
      .select({ id: funds.id, name: funds.name })
      .from(funds)
      .where(and(eq(funds.userId, userId), isNull(funds.deletedAt))),
    db
      .select({ id: wallets.id, name: wallets.name })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt))),
  ]);

  const fundNameById = new Map(fundRows.map((row) => [row.id, String(row.name)]));
  const walletNameById = new Map(
    walletRows.map((row) => [row.id, String(row.name)]),
  );

  const matches = findRoundtripMatches({
    rows: txRows,
    fundNameById,
    walletNameById,
  });

  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    totalTransactions: txRows.filter((row) => row.parentId === null).length,
    matchCount: matches.length,
    matches,
  };

  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`User ${user.id} (${user.username} <${user.email}>)`);
  console.log(
    `Parent transactions: ${payload.totalTransactions} | roundtrip matches: ${payload.matchCount}`,
  );
  console.log("");

  if (matches.length === 0) {
    console.log("No matching transactions found.");
    return;
  }

  for (const [index, match] of matches.entries()) {
    console.log(
      `${index + 1}. tx#${match.transactionId} | ${match.occurredAt.slice(0, 10)} | ${match.fundName} + ${match.walletName} | ${match.amount.toFixed(2)}`,
    );
    console.log(
      `   parent: pending=${match.isPending} posting=${match.isPosting} desc=${JSON.stringify(match.description)}`,
    );
    console.log(
      `   in:  child#${match.childIn.id} amount=${match.childIn.amount} pending=${match.childIn.isPending}`,
    );
    console.log(
      `   out: child#${match.childOut.id} amount=${match.childOut.amount} pending=${match.childOut.isPending}`,
    );
  }

  console.log("");
  console.log("JSON:");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
