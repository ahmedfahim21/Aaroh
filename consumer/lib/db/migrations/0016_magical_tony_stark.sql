ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "ownerId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_ownerId_User_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
UPDATE "Merchant" SET "ownerId" = (
  SELECT id FROM "User" WHERE LOWER(TRIM("walletAddress")) = LOWER(TRIM("Merchant"."walletAddress")) AND "walletAddress" IS NOT NULL LIMIT 1
)
WHERE "ownerId" IS NULL;
