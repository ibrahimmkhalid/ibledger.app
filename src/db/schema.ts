import {
  boolean,
  doublePrecision,
  foreignKey,
  integer,
  pgTable,
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
  isSavings: boolean().default(false).notNull(),
  pullPercentage: doublePrecision().default(0).notNull(),
  openingAmount: doublePrecision().default(0).notNull(),
  ...timestamps,
});

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
    isPosting: boolean().default(true).notNull(),
    isPending: boolean().default(true).notNull(),
    incomePull: doublePrecision(),

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
export type Wallet = InferSelectModel<typeof wallets>;
export type Transaction = InferSelectModel<typeof transactions>;

export type NewUser = InferInsertModel<typeof users>;
export type NewFund = InferInsertModel<typeof funds>;
export type NewWallet = InferInsertModel<typeof wallets>;
export type NewTransaction = InferInsertModel<typeof transactions>;
