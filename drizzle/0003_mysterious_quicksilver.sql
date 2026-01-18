ALTER TABLE "fund_feeds" ALTER COLUMN "feed_percentage" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fund_feeds" ALTER COLUMN "feed_percentage" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "fund_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "wallet_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "kind" varchar(32) DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "opening_amount" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurred_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" varchar(32) DEFAULT 'posted' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_posting" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_pending" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_id" varchar(255);--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "opening_amount" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_parent_id_transactions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "withdraw";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "feed_name";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "feed_percentage";--> statement-breakpoint
ALTER TABLE "wallets" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clerkId_unique" UNIQUE("clerk_id");