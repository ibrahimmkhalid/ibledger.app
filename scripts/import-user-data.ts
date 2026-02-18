import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "../src/db";
import { funds, transactions, users, wallets } from "../src/db/schema";

type PsuedoId = string | number;

type ImportWallet = {
  name: unknown;
  opening_amount: unknown;
  psuedo_id: unknown;
};

type ImportFund = {
  name: unknown;
  opening_amount: unknown;
  is_savings: unknown;
  pull_percentage: unknown;
  psuedo_id: unknown;
};

type ImportTransactionLine = {
  fund_psuedo_id?: unknown;
  wallet_psuedo_id?: unknown;
  amount: unknown;
  description?: unknown;
  occurred_at?: unknown;
  occured_at?: unknown;
  is_pending?: unknown;
  income_pull?: unknown;
};

type ImportTransaction = ImportTransactionLine & {
  child_transactions?: unknown;
};

type ImportFile = {
  wallets?: unknown;
  funds?: unknown;
  transactions?: unknown;
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

function toNumber(input: unknown, field: string): number {
  const n = typeof input === "number" ? input : Number(input);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for ${field}: ${String(input)}`);
  }
  return n;
}

function toBoolean(input: unknown, field: string): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (input === "true") return true;
  if (input === "false") return false;
  if (input === "1") return true;
  if (input === "0") return false;
  return Boolean(input);
}

function toPsuedoId(input: unknown, field: string): PsuedoId {
  if (typeof input === "string" || typeof input === "number") {
    if (input === "") throw new Error(`Empty ${field}`);
    return input;
  }
  throw new Error(`Invalid ${field}: ${String(input)}`);
}

function parseOccurredAt(line: ImportTransactionLine, label: string): Date {
  const raw = line.occurred_at ?? line.occured_at;
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new Error(`Invalid occurred_at for ${label}: ${String(raw)}`);
}

async function main() {
  // Set DEFAULT_USER_ID / DEFAULT_IN_FILE to avoid passing args every time.
  const DEFAULT_USER_ID: number | null = null;
  const DEFAULT_IN_FILE: string | null = null;

  const { flags, positional } = parseCliArgs(process.argv.slice(2));

  const userIdRaw = flags.userId ?? flags.user ?? positional[0];
  const userId = userIdRaw ? Number(userIdRaw) : DEFAULT_USER_ID;
  if (!userId || Number.isNaN(userId)) {
    throw new Error(
      "Missing userId. Usage: npm run import -- --userId 456 --in ./export.json",
    );
  }

  const inFile =
    flags.in ??
    flags.input ??
    positional[1] ??
    DEFAULT_IN_FILE ??
    path.resolve(process.cwd(), `./user-${userId}-export.json`);

  const raw = await readFile(inFile, "utf8");
  const parsed: ImportFile = JSON.parse(raw);

  const walletsIn = Array.isArray(parsed.wallets)
    ? (parsed.wallets as ImportWallet[])
    : null;
  const fundsIn = Array.isArray(parsed.funds) ? (parsed.funds as ImportFund[]) : null;
  const txIn = Array.isArray(parsed.transactions)
    ? (parsed.transactions as ImportTransaction[])
    : null;

  if (!walletsIn || !fundsIn || !txIn) {
    throw new Error(
      "Invalid import file: expected { wallets: [], funds: [], transactions: [] }",
    );
  }

  const userExists = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);

  if (!userExists) {
    throw new Error(`User not found (or deleted): userId=${userId}`);
  }

  const walletIdByPsuedo = new Map<string, number>();
  const fundIdByPsuedo = new Map<string, number>();

  const stats = {
    deletedTransactions: 0,
    deletedWallets: 0,
    deletedFunds: 0,
    insertedWallets: 0,
    insertedFunds: 0,
    insertedRoots: 0,
    insertedChildren: 0,
  };

  await db.transaction(async (tx) => {
    // Hard delete existing data for this user.
    const delChildren = await tx
      .delete(transactions)
      .where(and(eq(transactions.userId, userId), isNotNull(transactions.parentId)))
      .returning({ id: transactions.id });
    const delRoots = await tx
      .delete(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.parentId)))
      .returning({ id: transactions.id });

    const delWallets = await tx
      .delete(wallets)
      .where(eq(wallets.userId, userId))
      .returning({ id: wallets.id });
    const delFunds = await tx
      .delete(funds)
      .where(eq(funds.userId, userId))
      .returning({ id: funds.id });

    stats.deletedTransactions = delChildren.length + delRoots.length;
    stats.deletedWallets = delWallets.length;
    stats.deletedFunds = delFunds.length;

    // Create wallets.
    for (const w of walletsIn) {
      const psuedoId = toPsuedoId(w.psuedo_id, "wallet.psuedo_id");
      const name = String(w.name);
      const openingAmount = toNumber(w.opening_amount, "wallet.opening_amount");

      const inserted = await tx
        .insert(wallets)
        .values({ userId, name, openingAmount })
        .returning({ id: wallets.id });

      walletIdByPsuedo.set(String(psuedoId), inserted[0]!.id);
      stats.insertedWallets++;
    }

    // Create funds.
    for (const f of fundsIn) {
      const psuedoId = toPsuedoId(f.psuedo_id, "fund.psuedo_id");
      const name = String(f.name);
      const openingAmount = toNumber(f.opening_amount, "fund.opening_amount");
      const isSavings = toBoolean(f.is_savings, "fund.is_savings");
      const pullPercentage = isSavings
        ? 0
        : toNumber(f.pull_percentage, "fund.pull_percentage");

      const inserted = await tx
        .insert(funds)
        .values({
          userId,
          name,
          openingAmount,
          isSavings,
          pullPercentage,
        })
        .returning({ id: funds.id });

      fundIdByPsuedo.set(String(psuedoId), inserted[0]!.id);
      stats.insertedFunds++;
    }

    type Root = {
      key: string;
      root: ImportTransaction;
      occurredAt: Date;
      hasChildren: boolean;
      index: number;
    };

    const roots: Root[] = txIn.map((t, index) => {
      const occurredAt = parseOccurredAt(t, `transactions[${index}]`);
      const childRaw = (t as ImportTransaction).child_transactions;
      const children = Array.isArray(childRaw) ? childRaw : [];
      return {
        key: `t${index}`,
        root: t,
        occurredAt,
        hasChildren: children.length > 0,
        index,
      };
    });

    const rootByKey = new Map<string, Root>();
    for (const r of roots) rootByKey.set(r.key, r);

    const insertedRootId = new Map<string, number>();

    type Event =
      | {
          kind: "root";
          key: string;
          occurredAt: Date;
          index: number;
        }
      | {
          kind: "child";
          key: string;
          occurredAt: Date;
          index: number;
          childIndex: number;
          child: ImportTransactionLine;
        };

    const events: Event[] = [];
    for (const r of roots) {
      events.push({ kind: "root", key: r.key, occurredAt: r.occurredAt, index: r.index });

      const childRaw = r.root.child_transactions;
      const children = Array.isArray(childRaw) ? (childRaw as ImportTransactionLine[]) : [];
      for (let j = 0; j < children.length; j++) {
        const child = children[j]!;
        events.push({
          kind: "child",
          key: r.key,
          occurredAt: parseOccurredAt(child, `transactions[${r.index}].child_transactions[${j}]`),
          index: r.index,
          childIndex: j,
          child,
        });
      }
    }

    events.sort((a, b) => {
      const ta = a.occurredAt.getTime();
      const tb = b.occurredAt.getTime();
      if (ta !== tb) return ta - tb;
      if (a.kind !== b.kind) return a.kind === "root" ? -1 : 1;
      if (a.index !== b.index) return a.index - b.index;
      if (a.kind === "child" && b.kind === "child") return a.childIndex - b.childIndex;
      return 0;
    });

    const resolveWalletId = (psuedo: unknown) => {
      if (psuedo === null || psuedo === undefined) return null;
      const id = walletIdByPsuedo.get(String(psuedo));
      if (!id) {
        throw new Error(`Unknown wallet_psuedo_id: ${String(psuedo)}`);
      }
      return id;
    };

    const resolveFundId = (psuedo: unknown) => {
      if (psuedo === null || psuedo === undefined) return null;
      const id = fundIdByPsuedo.get(String(psuedo));
      if (!id) {
        throw new Error(`Unknown fund_psuedo_id: ${String(psuedo)}`);
      }
      return id;
    };

    const insertRootIfNeeded = async (key: string) => {
      if (insertedRootId.has(key)) return;
      const root = rootByKey.get(key);
      if (!root) throw new Error(`Missing root transaction for key=${key}`);

      const walletId = resolveWalletId((root.root as ImportTransactionLine).wallet_psuedo_id);
      const fundId = resolveFundId((root.root as ImportTransactionLine).fund_psuedo_id);

      const descriptionRaw = (root.root as ImportTransactionLine).description;
      const description =
        descriptionRaw === null || descriptionRaw === undefined
          ? null
          : String(descriptionRaw);

      const isPendingRaw = (root.root as ImportTransactionLine).is_pending;
      const isPending =
        isPendingRaw === undefined ? true : toBoolean(isPendingRaw, "transaction.is_pending");

      const incomePullRaw = (root.root as ImportTransactionLine).income_pull;
      const incomePull =
        incomePullRaw === null || incomePullRaw === undefined
          ? null
          : toNumber(incomePullRaw, "transaction.income_pull");

      const amount = toNumber((root.root as ImportTransactionLine).amount, "transaction.amount");

      const inserted = await tx
        .insert(transactions)
        .values({
          userId,
          parentId: null,
          occurredAt: root.occurredAt,
          description,
          amount,
          isPending,
          incomePull,
          walletId,
          fundId,
          isPosting: root.hasChildren ? false : true,
        })
        .returning({ id: transactions.id });

      insertedRootId.set(key, inserted[0]!.id);
      stats.insertedRoots++;
    };

    for (const e of events) {
      if (e.kind === "root") {
        await insertRootIfNeeded(e.key);
        continue;
      }

      const parentKey = e.key;
      if (!insertedRootId.has(parentKey)) {
        const root = rootByKey.get(parentKey);
        if (root) {
          const rootTs = root.occurredAt.getTime();
          const childTs = e.occurredAt.getTime();
          if (childTs < rootTs) {
            console.warn(
              `Warning: child occurred_at (${e.occurredAt.toISOString()}) is earlier than parent occurred_at (${root.occurredAt.toISOString()}). Parent will be inserted first to satisfy FK.`,
            );
          }
        }
        await insertRootIfNeeded(parentKey);
      }

      const parentId = insertedRootId.get(parentKey)!;

      const walletId = resolveWalletId(e.child.wallet_psuedo_id);
      const fundId = resolveFundId(e.child.fund_psuedo_id);
      const descriptionRaw = e.child.description;
      const description =
        descriptionRaw === null || descriptionRaw === undefined
          ? null
          : String(descriptionRaw);

      const isPendingRaw = e.child.is_pending;
      const isPending =
        isPendingRaw === undefined ? true : toBoolean(isPendingRaw, "child.is_pending");

      const incomePullRaw = e.child.income_pull;
      const incomePull =
        incomePullRaw === null || incomePullRaw === undefined
          ? null
          : toNumber(incomePullRaw, "child.income_pull");

      const amount = toNumber(e.child.amount, "child.amount");

      await tx.insert(transactions).values({
        userId,
        parentId,
        occurredAt: e.occurredAt,
        description,
        amount,
        isPending,
        incomePull,
        walletId,
        fundId,
        isPosting: true,
      });

      stats.insertedChildren++;
    }
  });

  console.log(
    `Imported into userId=${userId} from ${inFile}: deleted(transactions=${stats.deletedTransactions}, wallets=${stats.deletedWallets}, funds=${stats.deletedFunds}) inserted(wallets=${stats.insertedWallets}, funds=${stats.insertedFunds}, roots=${stats.insertedRoots}, children=${stats.insertedChildren})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
