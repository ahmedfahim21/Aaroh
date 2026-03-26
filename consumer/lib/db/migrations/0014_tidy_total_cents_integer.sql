ALTER TABLE "ConsumerOrder"
ALTER COLUMN "totalCents" TYPE integer
USING CASE
  WHEN "totalCents" IS NULL THEN NULL
  ELSE ("totalCents"#>>'{}')::integer
END;
