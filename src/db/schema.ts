import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { InferInsertModel, InferSelectModel, sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp(),
  deletedAt: timestamp(),
};

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  clerkId: varchar({ length: 255 }).unique(),
  username: varchar({ length: 255 }).notNull().unique(),
  email: varchar({ length: 255 }).notNull().unique(),
  onboarded: boolean().default(false),
  ...timestamps,
});

export const funds = pgTable(
  "funds",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id),
    name: varchar({ length: 255 }).notNull(),
    isSavings: boolean().default(false).notNull(),
    pullPercentage: doublePrecision().default(0).notNull(),
    openingAmount: doublePrecision().default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("funds_active_user_idx")
      .on(table.userId, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    index("funds_active_savings_idx")
      .on(table.userId, table.isSavings)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id),
    name: varchar({ length: 255 }).notNull(),
    openingAmount: doublePrecision().default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("wallets_active_user_idx")
      .on(table.userId, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id),

    parentId: integer(),

    occurredAt: timestamp().defaultNow().notNull(),
    description: text(),
    isPosting: boolean().default(true).notNull(),
    isPending: boolean().default(true).notNull(),
    incomePull: doublePrecision(),

    fundId: integer().references(() => funds.id),
    walletId: integer().references(() => wallets.id),

    amount: doublePrecision().notNull(),

    ...timestamps,
  },
  (table) => [
    index("transactions_active_page_idx")
      .on(table.userId, table.occurredAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index("transactions_events_page_idx")
      .on(table.userId, table.occurredAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL AND ${table.parentId} IS NULL`),
    index("transactions_pending_events_page_idx")
      .on(table.userId, table.occurredAt.desc(), table.id.desc())
      .where(
        sql`${table.deletedAt} IS NULL AND ${table.parentId} IS NULL AND ${table.isPending} = true`,
      ),
    index("transactions_active_postings_wallet_idx")
      .on(table.userId, table.walletId)
      .where(
        sql`${table.deletedAt} IS NULL AND ${table.isPosting} = true AND ${table.walletId} IS NOT NULL`,
      ),
    index("transactions_active_postings_fund_idx")
      .on(table.userId, table.fundId)
      .where(
        sql`${table.deletedAt} IS NULL AND ${table.isPosting} = true AND ${table.fundId} IS NOT NULL`,
      ),
    index("transactions_active_children_idx")
      .on(table.userId, table.parentId, table.id.desc())
      .where(
        sql`${table.deletedAt} IS NULL AND ${table.isPosting} = true AND ${table.parentId} IS NOT NULL`,
      ),
    index("transactions_pending_by_user_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.isPending} = true`),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }),
  ],
);

export type User = InferSelectModel<typeof users>;
export type Fund = InferSelectModel<typeof funds>;
export type Wallet = InferSelectModel<typeof wallets>;
export type Transaction = InferSelectModel<typeof transactions>;

export type NewUser = InferInsertModel<typeof users>;
export type NewFund = InferInsertModel<typeof funds>;
export type NewWallet = InferInsertModel<typeof wallets>;
export type NewTransaction = InferInsertModel<typeof transactions>;
