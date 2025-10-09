import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { InferSelectModel, InferInsertModel } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp(),
  deletedAt: timestamp(),
};

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar({ length: 255 }).notNull().unique(),
  email: varchar({ length: 255 }).notNull().unique(),
  ...timestamps,
});

export const funds = pgTable("funds", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  name: varchar({ length: 255 }),
  amount: doublePrecision().default(0).notNull(),
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
    feedPercentage: doublePrecision(),
  },
  (table) => [primaryKey({ columns: [table.source, table.dest] })],
);

export const wallets = pgTable("wallets", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  name: varchar({ length: 255 }),
  amount: doublePrecision().default(0).notNull(),
  ...timestamps,
});

export const transactions = pgTable("transactions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  fundId: integer()
    .notNull()
    .references(() => funds.id),
  walletId: integer()
    .notNull()
    .references(() => wallets.id),
  amount: doublePrecision(),
  withdraw: boolean().default(true).notNull(),
  feedName: varchar({ length: 255 }),
  feedPercentage: doublePrecision(),
  description: text(),
  ...timestamps,
});

export type User = InferSelectModel<typeof users>;
export type Fund = InferSelectModel<typeof funds>;
export type Transaction = InferSelectModel<typeof transactions>;
export type FundFeed = InferSelectModel<typeof fundFeeds>;
export type Wallet = InferSelectModel<typeof wallets>;

export type NewUser = InferInsertModel<typeof users>;
export type NewFund = InferInsertModel<typeof funds>;
export type NewTransaction = InferInsertModel<typeof transactions>;
export type NewFundFeed = InferInsertModel<typeof fundFeeds>;
export type NewWallet = InferInsertModel<typeof wallets>;
