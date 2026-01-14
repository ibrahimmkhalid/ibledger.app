-- Ledger-authoritative migration (custom)

-- USERS
ALTER TABLE "users" ADD COLUMN "clerk_id" varchar(255);
ALTER TABLE "users" ADD CONSTRAINT "users_clerk_id_unique" UNIQUE ("clerk_id");

-- FUNDS
ALTER TABLE "funds" ADD COLUMN "kind" varchar(32) NOT NULL DEFAULT 'regular';
ALTER TABLE "funds" ADD COLUMN "opening_amount" double precision NOT NULL DEFAULT 0;

UPDATE "funds" SET "name" = 'Unnamed Fund' WHERE "name" IS NULL;
ALTER TABLE "funds" ALTER COLUMN "name" SET NOT NULL;

-- Preserve existing balances as opening amounts
UPDATE "funds" SET "opening_amount" = COALESCE("amount", 0);
ALTER TABLE "funds" DROP COLUMN "amount";

-- FUND FEEDS
UPDATE "fund_feeds" SET "feed_percentage" = 0 WHERE "feed_percentage" IS NULL;
ALTER TABLE "fund_feeds" ALTER COLUMN "feed_percentage" SET DEFAULT 0;
ALTER TABLE "fund_feeds" ALTER COLUMN "feed_percentage" SET NOT NULL;

-- WALLETS
ALTER TABLE "wallets" ADD COLUMN "opening_amount" double precision NOT NULL DEFAULT 0;

UPDATE "wallets" SET "name" = 'Unnamed Wallet' WHERE "name" IS NULL;
ALTER TABLE "wallets" ALTER COLUMN "name" SET NOT NULL;

-- Preserve existing balances as opening amounts
UPDATE "wallets" SET "opening_amount" = COALESCE("amount", 0);
ALTER TABLE "wallets" DROP COLUMN "amount";

-- TRANSACTIONS
ALTER TABLE "transactions" ADD COLUMN "parent_id" integer;
ALTER TABLE "transactions" ADD COLUMN "occurred_at" timestamp NOT NULL DEFAULT now();
ALTER TABLE "transactions" ADD COLUMN "status" varchar(32) NOT NULL DEFAULT 'posted';
ALTER TABLE "transactions" ADD COLUMN "is_posting" boolean NOT NULL DEFAULT true;

-- Backfill occurred_at from created_at
UPDATE "transactions" SET "occurred_at" = COALESCE("created_at", now());

-- Ensure amount is non-null and convert to signed amount using withdraw
UPDATE "transactions" SET "amount" = COALESCE("amount", 0);
UPDATE "transactions"
SET "amount" = CASE
  WHEN "withdraw" IS TRUE THEN -ABS("amount")
  ELSE ABS("amount")
END;

ALTER TABLE "transactions" ALTER COLUMN "amount" SET NOT NULL;

-- Allow wallet-only and fund-only postings
ALTER TABLE "transactions" ALTER COLUMN "fund_id" DROP NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "wallet_id" DROP NOT NULL;

-- Drop deprecated columns
ALTER TABLE "transactions" DROP COLUMN "withdraw";
ALTER TABLE "transactions" DROP COLUMN "feed_name";
ALTER TABLE "transactions" DROP COLUMN "feed_percentage";

-- Self-referencing FK for parent/child events
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_parent_id_transactions_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."transactions"("id")
  ON DELETE no action ON UPDATE no action;

-- Helpful indexes for totals and paging
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "transactions_user_wallet_idx" ON "transactions" ("user_id", "wallet_id");
CREATE INDEX IF NOT EXISTS "transactions_user_fund_idx" ON "transactions" ("user_id", "fund_id");
CREATE INDEX IF NOT EXISTS "transactions_user_occurred_at_idx" ON "transactions" ("user_id", "occurred_at");
