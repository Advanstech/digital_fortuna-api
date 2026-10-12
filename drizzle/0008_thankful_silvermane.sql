CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk') THEN
		ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "paystack_ref";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "paystack_ref";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "paystack_customer_id";
