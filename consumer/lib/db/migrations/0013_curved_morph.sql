CREATE TABLE IF NOT EXISTS "ConsumerOrder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" text NOT NULL,
	"merchantUrl" text NOT NULL,
	"merchantName" text,
	"totalCents" json,
	"lineItems" json,
	"status" varchar(32) DEFAULT 'completed' NOT NULL,
	"paymentType" varchar(32),
	"orderData" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "role" varchar DEFAULT 'consumer' NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "walletAddress" varchar(64);