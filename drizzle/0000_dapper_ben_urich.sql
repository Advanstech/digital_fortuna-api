CREATE TYPE "public"."listing_category" AS ENUM('saas', 'pos', 'mobile', 'blockchain', 'marketing', 'fintech', 'edtech', 'ecommerce', 'other');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'review', 'live', 'sold', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'seller', 'admin');--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"description" text,
	"category" "listing_category" NOT NULL,
	"acquisition_price" integer,
	"monthly_license_price" integer,
	"revenue_mrr" integer,
	"revenue_arr" integer,
	"tech_stack" jsonb,
	"demo_url" text,
	"repo_url" text,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false,
	"verified" boolean DEFAULT false,
	"ai_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"company_name" text,
	"verified" boolean DEFAULT false,
	"location" text,
	"social_links" jsonb
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"escrow_status" text NOT NULL,
	"stripe_payment_intent_id" text,
	"paystack_ref" text,
	"amount_usd" integer NOT NULL,
	"fee_amount" integer NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"kyc_status" text DEFAULT 'unverified',
	"country" text,
	"subscription_tier" text DEFAULT 'free',
	"stripe_customer_id" text,
	"paystack_customer_id" text,
	"refresh_token" text,
	"two_factor_secret" text,
	"is_two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;