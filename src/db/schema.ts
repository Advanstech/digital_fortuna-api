import { pgTable, uuid, text, timestamp, boolean, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin', 'super_admin', 'broker', 'vc', 'legal', 'bank']);
export const kycStatusEnum = pgEnum('kyc_status', ['unverified', 'pending', 'verified', 'rejected']);
export const listingStatusEnum = pgEnum('listing_status', ['draft', 'review', 'live', 'sold', 'archived']);
export const listingCategoryEnum = pgEnum('listing_category', ['saas', 'pos', 'mobile', 'blockchain', 'marketing', 'fintech', 'edtech', 'ecommerce', 'other']);
export const businessModelEnum = pgEnum('business_model', ['subscription', 'one_time', 'marketplace', 'advertising', 'freemium', 'licensing', 'hybrid', 'other']);
export const growthTrendEnum = pgEnum('growth_trend', ['accelerating', 'growing', 'stable', 'declining']);
export const dealStatusEnum = pgEnum('deal_status', ['negotiation', 'loi_signed', 'due_diligence', 'apa_signed', 'escrow', 'closed', 'cancelled']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'paid', 'released', 'refunded']);
export const documentTypeEnum = pgEnum('document_type', ['loi', 'apa', 'due_diligence', 'nda', 'dd_checklist', 'escrow_agreement']);
export const reportTypeEnum = pgEnum('report_type', ['cim', 'valuation', 'pnl']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'unknown', 'refunded']);
export const paymentPurposeEnum = pgEnum('payment_purpose', ['escrow_deposit', 'listing_fee', 'success_fee', 'buyer_subscription', 'refund', 'escrow_release', 'other']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  role: userRoleEnum('role').default('buyer').notNull(),
  kycStatus: kycStatusEnum('kyc_status').default('unverified'),
  kycRejectionReason: text('kyc_rejection_reason'),
  country: text('country'),
  subscriptionTier: text('subscription_tier').default('free'),
  refreshToken: text('refresh_token'),
  twoFactorSecret: text('two_factor_secret'),
  isTwoFactorEnabled: boolean('is_two_factor_enabled').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  displayName: text('display_name'),
  fullLegalName: text('full_legal_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  companyName: text('company_name'),
  nationality: text('nationality'),
  dateOfBirth: text('date_of_birth'),
  phone: text('phone'),
  verified: boolean('verified').default(false),
  location: text('location'),
  socialLinks: jsonb('social_links'),
  kycData: jsonb('kyc_data'),
});

export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').references(() => users.id).notNull(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  tagline: text('tagline'),
  description: text('description'),
  category: listingCategoryEnum('category').notNull(),
  businessModel: businessModelEnum('business_model'),
  acquisitionPrice: integer('acquisition_price'),
  monthlyLicensePrice: integer('monthly_license_price'),
  revenueMrr: integer('revenue_mrr'),
  revenueArr: integer('revenue_arr'),
  monthlyProfit: integer('monthly_profit'),
  profitMargin: integer('profit_margin'), // percentage 0-100
  customerCount: integer('customer_count'),
  churnRate: integer('churn_rate'), // percentage x100 (e.g. 250 = 2.5%)
  trafficMonthly: integer('traffic_monthly'),
  businessAge: integer('business_age'), // months since launch
  teamSize: integer('team_size'),
  growthTrend: growthTrendEnum('growth_trend'),
  reasonForSelling: text('reason_for_selling'),
  country: text('country'), // where the business is incorporated
  isVerifiedRevenue: boolean('is_verified_revenue').default(false),
  techStack: jsonb('tech_stack'),
  demoUrl: text('demo_url'),
  repoUrl: text('repo_url'),
  // Rich sales collateral: highlights[], metrics[{label,value,icon}], benefits[{title,desc}], relevance, growth[]
  details: jsonb('details'),
  // Seller documents: P&L, analytics, revenue proof URLs
  sellerDocuments: jsonb('seller_documents'),
  status: listingStatusEnum('status').default('draft').notNull(),
  featured: boolean('featured').default(false),
  verified: boolean('verified').default(false),
  aiScore: integer('ai_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'),
});

export const listingMedia = pgTable('listing_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  type: text('type').notNull(), // image, video, demo
  url: text('url').notNull(),
  position: integer('position').default(0),
});

export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').default('USD').notNull(),
  status: text('status').default('pending').notNull(),
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  offerId: uuid('offer_id').references(() => offers.id).notNull(),
  escrowStatus: text('escrow_status').notNull(),
  gtpayPartnerTransId: text('gtpay_partner_trans_id'),
  gtpayPaymentId: uuid('gtpay_payment_id'),
  amountUsd: integer('amount_usd').notNull(),
  amountGhs: integer('amount_ghs'), // amount in pesewas
  feeAmount: integer('fee_amount').notNull(),
  releasedAt: timestamp('released_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  sellerId: uuid('seller_id').references(() => users.id).notNull(),
  agreedPrice: integer('agreed_price'),
  status: dealStatusEnum('status').default('negotiation').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const dealMessages = pgTable('deal_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id).notNull(),
  senderId: uuid('sender_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  gtpayPartnerTransId: text('gtpay_partner_trans_id'),
  gtpayPaymentId: uuid('gtpay_payment_id'),
  status: invoiceStatusEnum('status').default('pending').notNull(),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  releasedAt: timestamp('released_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiAudits = pgTable('ai_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  documentType: documentTypeEnum('document_type').notNull(),
  content: jsonb('content').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

export const financialRecords = pgTable('financial_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  monthYear: text('month_year').notNull(),
  revenue: integer('revenue').notNull(),
  expenses: integer('expenses').notNull(),
  netIncome: integer('net_income').notNull(),
  rawInput: jsonb('raw_input'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const buyerMandates = pgTable('buyer_mandates', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  targetCategories: text('target_categories').array(),
  minMrr: integer('min_mrr'),
  maxBudget: integer('max_budget'),
  preferences: text('preferences'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiBrokerReports = pgTable('ai_broker_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  reportType: reportTypeEnum('report_type').notNull(),
  content: jsonb('content').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

// ── Due Diligence ────────────────────────────────────────────────────────
export const dueDiligenceRooms = pgTable('due_diligence_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id).notNull(),
  status: text('status').default('open').notNull(), // open, completed, cancelled
  checklistData: jsonb('checklist_data'), // structured checklist from AI
  completionPct: integer('completion_pct').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const dueDiligenceDocuments = pgTable('due_diligence_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').references(() => dueDiligenceRooms.id).notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  category: text('category').notNull(), // financial, legal, technical, operational, customer, ip
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  status: text('status').default('pending_review').notNull(), // pending_review, approved, flagged, rejected
  reviewNotes: text('review_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const dueDiligenceChecklistItems = pgTable('due_diligence_checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').references(() => dueDiligenceRooms.id).notNull(),
  category: text('category').notNull(),
  item: text('item').notNull(),
  description: text('description'),
  priority: text('priority').default('medium').notNull(), // critical, high, medium, low
  status: text('status').default('pending').notNull(), // pending, in_progress, completed, waived
  completedBy: uuid('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  documentId: uuid('document_id').references(() => dueDiligenceDocuments.id),
});

// ── Deal Documents (generated contracts, signed docs) ────────────────────
export const dealDocuments = pgTable('deal_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id).notNull(),
  documentType: text('document_type').notNull(), // loi, apa, nda, dd_checklist, escrow_agreement
  title: text('title').notNull(),
  content: jsonb('content').notNull(), // { markdown, disclaimer, etc. }
  version: integer('version').default(1).notNull(),
  status: text('status').default('draft').notNull(), // draft, sent, signed, countersigned, executed
  generatedBy: uuid('generated_by').references(() => users.id).notNull(),
  signedByBuyer: boolean('signed_by_buyer').default(false),
  signedBySeller: boolean('signed_by_seller').default(false),
  buyerSignedAt: timestamp('buyer_signed_at'),
  sellerSignedAt: timestamp('seller_signed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── GTPay Payments ────────────────────────────────────────────────────────
export const gtpayPayments = pgTable('gtpay_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  dealId: uuid('deal_id').references(() => deals.id),
  listingId: uuid('listing_id').references(() => listings.id),
  partnerTransId: text('partner_trans_id').unique().notNull(),
  gtbTransId: text('gtb_trans_id'),
  providerTransId: text('provider_trans_id'),
  serviceName: text('service_name').notNull(), // creditwallet, debitwallet, banktrf
  serviceNumber: text('service_number').notNull(),
  secondaryServiceNumber: text('secondary_service_number'),
  amount: integer('amount').notNull(), // amount in pesewas (GHS x 100)
  currency: text('currency').default('GHS').notNull(),
  purpose: paymentPurposeEnum('purpose').notNull(),
  status: paymentStatusEnum('status').default('pending').notNull(),
  gtbStatus: text('gtb_status'), // raw GTBank status: PENDING, COMPLETED, FAILED
  paidBy: text('paid_by').notNull(),
  payeeName: text('payee_name'),
  remarks: text('remarks'),
  callbackReceived: boolean('callback_received').default(false),
  recoveredAfterTimeout: boolean('recovered_after_timeout').default(false),
  metadata: jsonb('metadata'), // store full GTBank response
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// ── Escrow Ledger ────────────────────────────────────────────────────────
export const escrowLedger = pgTable('escrow_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id).notNull(),
  paymentId: uuid('payment_id').references(() => gtpayPayments.id),
  entryType: text('entry_type').notNull(), // deposit, release, refund, fee_deduction
  amount: integer('amount').notNull(), // pesewas
  currency: text('currency').default('GHS').notNull(),
  fromUserId: uuid('from_user_id').references(() => users.id),
  toUserId: uuid('to_user_id').references(() => users.id),
  description: text('description'),
  balanceAfter: integer('balance_after'), // running escrow balance for this deal
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Marketplace Fees ─────────────────────────────────────────────────────
export const marketplaceFees = pgTable('marketplace_fees', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id),
  listingId: uuid('listing_id').references(() => listings.id),
  userId: uuid('user_id').references(() => users.id).notNull(),
  feeType: text('fee_type').notNull(), // listing_fee, success_fee, buyer_subscription
  amount: integer('amount').notNull(), // pesewas
  currency: text('currency').default('GHS').notNull(),
  paymentId: uuid('payment_id').references(() => gtpayPayments.id),
  status: text('status').default('pending').notNull(), // pending, paid, waived
  createdAt: timestamp('created_at').defaultNow().notNull(),
  paidAt: timestamp('paid_at'),
});

// ── Platform Analytics / Admin ────────────────────────────────────────────
export const platformEvents = pgTable('platform_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(), // listing_created, deal_opened, offer_made, payment_received, etc.
  actorId: uuid('actor_id').references(() => users.id),
  entityType: text('entity_type'), // listing, deal, offer, invoice
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
