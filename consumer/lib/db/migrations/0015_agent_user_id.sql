ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "userId" text;
UPDATE "Agent" SET "userId" = 'legacy-migration' WHERE "userId" IS NULL;
ALTER TABLE "Agent" ALTER COLUMN "userId" SET NOT NULL;
