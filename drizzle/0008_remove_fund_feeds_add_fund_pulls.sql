ALTER TABLE "funds" ADD COLUMN IF NOT EXISTS "is_savings" boolean NOT NULL DEFAULT false;
ALTER TABLE "funds" ADD COLUMN IF NOT EXISTS "pull_percentage" double precision NOT NULL DEFAULT 0;

-- Migrate legacy funds.kind -> funds.is_savings
UPDATE "funds"
SET "is_savings" = ("kind" = 'savings')
WHERE "kind" IS NOT NULL;

-- Migrate legacy fund_feeds -> funds.pull_percentage
UPDATE "funds" f
SET "pull_percentage" = ff."feed_percentage"
FROM "fund_feeds" ff
WHERE ff."dest" = f."id";

-- Legacy income funds are no longer used; keep the rows but hide them.
UPDATE "funds"
SET "deleted_at" = COALESCE("deleted_at", NOW()),
    "updated_at" = NOW()
WHERE "kind" = 'income';

DROP TABLE IF EXISTS "fund_feeds";

ALTER TABLE "funds" DROP COLUMN IF EXISTS "kind";
