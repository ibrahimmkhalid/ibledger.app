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

export const accounts = pgTable("accounts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  name: varchar({ length: 255 }),
  ...timestamps,
});

export const accountFeeds = pgTable(
  "account_feeds",
  {
    source: integer()
      .notNull()
      .references(() => accounts.id),
    dest: integer()
      .notNull()
      .references(() => accounts.id),
    feedPercentage: doublePrecision(),
  },
  (table) => [primaryKey({ columns: [table.source, table.dest] })],
);

export const transactions = pgTable("transactions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  accountId: integer()
    .notNull()
    .references(() => accounts.id),
  amount: doublePrecision(),
  withdraw: boolean().default(true),
  feedName: varchar({ length: 255 }),
  feedPercentage: doublePrecision(),
  description: text(),
  ...timestamps,
});

export type User = InferSelectModel<typeof users>;
export type Account = InferSelectModel<typeof accounts>;
export type Transaction = InferSelectModel<typeof transactions>;
export type AccountFeed = InferSelectModel<typeof accountFeeds>;

export type NewUser = InferInsertModel<typeof users>;
export type NewAccount = InferInsertModel<typeof accounts>;
export type NewTransaction = InferInsertModel<typeof transactions>;
export type NewAccountFeed = InferInsertModel<typeof accountFeeds>;
