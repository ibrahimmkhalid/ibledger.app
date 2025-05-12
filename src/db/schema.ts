import {
  boolean,
  decimal,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar({ length: 255 }).notNull(),
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
  share: decimal(),
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
  amount: decimal(),
  directDepositOverride: boolean().default(false),
  note: text(),
});
