ALTER TABLE "funds" ALTER COLUMN "amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "withdraw" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "amount" SET NOT NULL;