CREATE TYPE "public"."business_model" AS ENUM('subscription', 'one_time', 'marketplace', 'advertising', 'freemium', 'licensing', 'hybrid', 'other');--> statement-breakpoint
CREATE TYPE "public"."growth_trend" AS ENUM('accelerating', 'growing', 'stable', 'declining');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('escrow_deposit', 'listing_fee', 'success_fee', 'buyer_subscription', 'refund', 'escrow_release', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'unknown', 'refunded');--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'nda';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'dd_checklist';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'escrow_agreement';--> statement-breakpoint
CREATE TABLE "deal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_by" uuid NOT NULL,
	"signed_by_buyer" boolean DEFAULT false,
	"signed_by_seller" boolean DEFAULT false,
	"buyer_signed_at" timestamp,
	"seller_signed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "due_diligence_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"category" text NOT NULL,
	"item" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp,
	"notes" text,
	"document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "due_diligence_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"category" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "due_diligence_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"checklist_data" jsonb,
	"completion_pct" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"payment_id" uuid,
	"entry_type" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"description" text,
	"balance_after" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtpay_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deal_id" uuid,
	"listing_id" uuid,
	"partner_trans_id" text NOT NULL,
	"gtb_trans_id" text,
	"provider_trans_id" text,
	"service_name" text NOT NULL,
	"service_number" text NOT NULL,
	"secondary_service_number" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"gtb_status" text,
	"paid_by" text NOT NULL,
	"payee_name" text,
	"remarks" text,
	"callback_received" boolean DEFAULT false,
	"recovered_after_timeout" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "gtpay_payments_partner_trans_id_unique" UNIQUE("partner_trans_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid,
	"listing_id" uuid,
	"user_id" uuid NOT NULL,
	"fee_type" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"payment_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "kyc_status" SET DEFAULT 'unverified'::"public"."kyc_status";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "kyc_status" SET DATA TYPE "public"."kyc_status" USING "kyc_status"::"public"."kyc_status";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "gtpay_partner_trans_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "gtpay_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "business_model" "business_model";--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "monthly_profit" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "profit_margin" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "customer_count" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "churn_rate" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "traffic_monthly" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "business_age" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "team_size" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "growth_trend" "growth_trend";--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "reason_for_selling" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "is_verified_revenue" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "seller_documents" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "full_legal_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "date_of_birth" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "gtpay_partner_trans_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "gtpay_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "amount_ghs" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_checklist_items" ADD CONSTRAINT "due_diligence_checklist_items_room_id_due_diligence_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."due_diligence_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_checklist_items" ADD CONSTRAINT "due_diligence_checklist_items_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_checklist_items" ADD CONSTRAINT "due_diligence_checklist_items_document_id_due_diligence_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."due_diligence_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_documents" ADD CONSTRAINT "due_diligence_documents_room_id_due_diligence_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."due_diligence_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_documents" ADD CONSTRAINT "due_diligence_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_rooms" ADD CONSTRAINT "due_diligence_rooms_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_ledger" ADD CONSTRAINT "escrow_ledger_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_ledger" ADD CONSTRAINT "escrow_ledger_payment_id_gtpay_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."gtpay_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_ledger" ADD CONSTRAINT "escrow_ledger_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_ledger" ADD CONSTRAINT "escrow_ledger_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtpay_payments" ADD CONSTRAINT "gtpay_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtpay_payments" ADD CONSTRAINT "gtpay_payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtpay_payments" ADD CONSTRAINT "gtpay_payments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_fees" ADD CONSTRAINT "marketplace_fees_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_fees" ADD CONSTRAINT "marketplace_fees_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_fees" ADD CONSTRAINT "marketplace_fees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_fees" ADD CONSTRAINT "marketplace_fees_payment_id_gtpay_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."gtpay_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_events" ADD CONSTRAINT "platform_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;