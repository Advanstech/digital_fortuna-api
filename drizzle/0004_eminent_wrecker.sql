CREATE TYPE "public"."report_type" AS ENUM('cim', 'valuation', 'pnl');--> statement-breakpoint
CREATE TABLE "ai_broker_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"report_type" "report_type" NOT NULL,
	"content" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"target_categories" text[],
	"min_mrr" integer,
	"max_budget" integer,
	"preferences" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"month_year" text NOT NULL,
	"revenue" integer NOT NULL,
	"expenses" integer NOT NULL,
	"net_income" integer NOT NULL,
	"raw_input" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_broker_reports" ADD CONSTRAINT "ai_broker_reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_mandates" ADD CONSTRAINT "buyer_mandates_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;