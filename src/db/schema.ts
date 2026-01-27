import {
  boolean,
  doublePrecision,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { InferInsertModel, InferSelectModel } from "drizzle-orm";

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
  ...timestamps,
});

export const funds = pgTable("funds", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  name: varchar({ length: 255 }).notNull(),
  kind: varchar({ length: 32 }).default("regular").notNull(),
  openingAmount: doublePrecision().default(0).notNull(),
  ...timestamps,
});

export const fundFeeds = pgTable(
  "fund_feeds",
  {
    source: integer()
      .notNull()
      .references(() => funds.id),
    dest: integer()
      .notNull()
      .references(() => funds.id),
    feedPercentage: doublePrecision().default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.source, table.dest] })],
);

export const wallets = pgTable("wallets", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  name: varchar({ length: 255 }).notNull(),
  openingAmount: doublePrecision().default(0).notNull(),
  ...timestamps,
});

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
    status: varchar({ length: 32 }).default("posted").notNull(),
    isPosting: boolean().default(true).notNull(),
    isPending: boolean().default(true).notNull(),
    incomePull: doublePrecision(),

    // Marker for internal ledger behavior (eg. overdraft).
    postingKind: varchar({ length: 32 }).default("normal").notNull(),

    fundId: integer().references(() => funds.id),
    walletId: integer().references(() => wallets.id),

    amount: doublePrecision().notNull(),

    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }),
  ],
);

export type User = InferSelectModel<typeof users>;
export type Fund = InferSelectModel<typeof funds>;
export type FundFeed = InferSelectModel<typeof fundFeeds>;
export type Wallet = InferSelectModel<typeof wallets>;
export type Transaction = InferSelectModel<typeof transactions>;

export type NewUser = InferInsertModel<typeof users>;
export type NewFund = InferInsertModel<typeof funds>;
export type NewFundFeed = InferInsertModel<typeof fundFeeds>;
export type NewWallet = InferInsertModel<typeof wallets>;
export type NewTransaction = InferInsertModel<typeof transactions>;
