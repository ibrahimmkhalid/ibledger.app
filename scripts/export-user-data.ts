import "dotenv/config";

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "../src/db";
import { funds, transactions, wallets } from "../src/db/schema";

type PsuedoId = string | number;

type ExportWallet = {
  name: string;
  opening_amount: number;
  psuedo_id: PsuedoId;
};

type ExportFund = {
  name: string;
  opening_amount: number;
  is_savings: boolean;
  pull_percentage: number;
  psuedo_id: PsuedoId;
};

type ExportTransactionLine = {
  fund_psuedo_id: PsuedoId | null;
  wallet_psuedo_id: PsuedoId | null;
  amount: number;
  description: string | null;
  occurred_at: string;
  is_pending: boolean;
  income_pull: number | null;
};

type ExportTransaction = ExportTransactionLine & {
  child_transactions: ExportTransactionLine[];
};

type ExportFile = {
  wallets: ExportWallet[];
  funds: ExportFund[];
  transactions: ExportTransaction[];
};

function parseCliArgs(argv: string[]) {
  const out: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    if (a.startsWith("--")) {
      const [kRaw, vRaw] = a.slice(2).split("=", 2);
      const k = kRaw?.trim();
      if (!k) continue;

      if (vRaw !== undefined) {
        out[k] = vRaw;
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[k] = next;
        i++;
      } else {
        out[k] = "true";
      }

      continue;
    }

    positional.push(a);
  }

  return { flags: out, positional };
}

function toIsoString(date: unknown): string {
  if (date instanceof Date) {
    return date.toISOString();
  }

  if (typeof date === "string") {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  throw new Error(`Invalid occurredAt: ${String(date)}`);
}

async function main() {
  // Set DEFAULT_USER_ID to avoid passing args every time.
  const DEFAULT_USER_ID: number | null = null;
  const { flags, positional } = parseCliArgs(process.argv.slice(2));

  const userIdRaw = flags.userId ?? flags.user ?? positional[0];
  const userId = userIdRaw ? Number(userIdRaw) : DEFAULT_USER_ID;
  if (!userId || Number.isNaN(userId)) {
    throw new Error(
      "Missing userId. Usage: npm run export -- --userId 123 --out ./export.json",
    );
  }

  const outFile =
    flags.out ??
    flags.output ??
    positional[1] ??
    path.resolve(process.cwd(), `./user-${userId}-export.json`);

  const [walletRows, fundRows, txRows] = await Promise.all([
    db
      .select({
        id: wallets.id,
        name: wallets.name,
        openingAmount: wallets.openingAmount,
      })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)))
      .orderBy(desc(wallets.id)),
    db
      .select({
        id: funds.id,
        name: funds.name,
        openingAmount: funds.openingAmount,
        isSavings: funds.isSavings,
        pullPercentage: funds.pullPercentage,
      })
      .from(funds)
      .where(and(eq(funds.userId, userId), isNull(funds.deletedAt)))
      .orderBy(desc(funds.id)),
    db
      .select({
        id: transactions.id,
        parentId: transactions.parentId,
        occurredAt: transactions.occurredAt,
        description: transactions.description,
        amount: transactions.amount,
        isPending: transactions.isPending,
        incomePull: transactions.incomePull,
        fundId: transactions.fundId,
        walletId: transactions.walletId,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.id)),
  ]);

  const walletsExport: ExportWallet[] = walletRows.map((w) => ({
    name: String(w.name),
    opening_amount: Number(w.openingAmount ?? 0),
    psuedo_id: w.id,
  }));

  const fundsExport: ExportFund[] = fundRows.map((f) => ({
    name: String(f.name),
    opening_amount: Number(f.openingAmount ?? 0),
    is_savings: Boolean(f.isSavings),
    pull_percentage: Number(f.pullPercentage ?? 0),
    psuedo_id: f.id,
  }));

  const childrenByParentId = new Map<number, ExportTransactionLine[]>();
  for (const r of txRows) {
    if (!r.parentId) continue;
    const list = childrenByParentId.get(r.parentId) ?? [];
    list.push({
      fund_psuedo_id: r.fundId ?? null,
      wallet_psuedo_id: r.walletId ?? null,
      amount: Number(r.amount),
      description: r.description ? String(r.description) : null,
      occurred_at: toIsoString(r.occurredAt),
      is_pending: Boolean(r.isPending),
      income_pull:
        r.incomePull === null || r.incomePull === undefined
          ? null
          : Number(r.incomePull),
    });
    childrenByParentId.set(r.parentId, list);
  }

  const transactionsExport: ExportTransaction[] = [];
  for (const r of txRows) {
    if (r.parentId) continue;
    transactionsExport.push({
      fund_psuedo_id: r.fundId ?? null,
      wallet_psuedo_id: r.walletId ?? null,
      amount: Number(r.amount),
      description: r.description ? String(r.description) : null,
      occurred_at: toIsoString(r.occurredAt),
      is_pending: Boolean(r.isPending),
      income_pull:
        r.incomePull === null || r.incomePull === undefined
          ? null
          : Number(r.incomePull),
      child_transactions: childrenByParentId.get(r.id) ?? [],
    });
  }

  const payload: ExportFile = {
    wallets: walletsExport,
    funds: fundsExport,
    transactions: transactionsExport,
  };

  await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    `Exported userId=${userId}: wallets=${walletsExport.length}, funds=${fundsExport.length}, transactions=${transactionsExport.length} -> ${outFile}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
