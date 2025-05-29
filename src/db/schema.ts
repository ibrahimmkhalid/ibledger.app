import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar({ length: 255 }).notNull().unique(),
  email: varchar({ length: 255 }).notNull().unique(),
  createdAt: timestamp().defaultNow(),
  deletedAt: timestamp(),
});

export const groupsTable = pgTable("groups", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  name: varchar({ length: 255 }).notNull(),
  isIncome: boolean().notNull().default(false),
  share: doublePrecision(),
});

export const activityTable = pgTable("activity", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  groupID: integer()
    .notNull()
    .references(() => groupsTable.id),
  timestamp: timestamp().defaultNow(),
  amount: doublePrecision(),
  directDepositOverride: boolean().default(false),
  note: text(),
});

export type User = InferSelectModel<typeof usersTable>;
export type Group = InferSelectModel<typeof groupsTable>;
export type Activity = InferSelectModel<typeof activityTable>;

export type NewUser = InferInsertModel<typeof usersTable>;
export type NewGroup = InferInsertModel<typeof groupsTable>;
export type NewActivity = InferInsertModel<typeof activityTable>;
