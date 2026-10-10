import { pgTable, uuid, text, timestamp, boolean, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin', 'super_admin', 'broker', 'vc', 'legal', 'bank']);
export const listingStatusEnum = pgEnum('listing_status', ['draft', 'review', 'live', 'sold', 'archived']);
export const listingCategoryEnum = pgEnum('listing_category', ['saas', 'pos', 'mobile', 'blockchain', 'marketing', 'fintech', 'edtech', 'ecommerce', 'other']);
export const dealStatusEnum = pgEnum('deal_status', ['negotiation', 'loi_signed', 'due_diligence', 'apa_signed', 'escrow', 'closed', 'cancelled']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'paid', 'released', 'refunded']);
export const documentTypeEnum = pgEnum('document_type', ['loi', 'apa', 'due_diligence']);
export const reportTypeEnum = pgEnum('report_type', ['cim', 'valuation', 'pnl']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  role: userRoleEnum('role').default('buyer').notNull(),
  kycStatus: text('kyc_status').default('unverified'),
  country: text('country'),
  subscriptionTier: text('subscription_tier').default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  paystackCustomerId: text('paystack_customer_id'),
  refreshToken: text('refresh_token'),
  twoFactorSecret: text('two_factor_secret'),
  isTwoFactorEnabled: boolean('is_two_factor_enabled').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  companyName: text('company_name'),
  verified: boolean('verified').default(false),
  location: text('location'),
  socialLinks: jsonb('social_links'),
});

export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').references(() => users.id).notNull(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  tagline: text('tagline'),
  description: text('description'),
  category: listingCategoryEnum('category').notNull(),
  acquisitionPrice: integer('acquisition_price'),
  monthlyLicensePrice: integer('monthly_license_price'),
  revenueMrr: integer('revenue_mrr'),
  revenueArr: integer('revenue_arr'),
  techStack: jsonb('tech_stack'),
  demoUrl: text('demo_url'),
  repoUrl: text('repo_url'),
  // Rich sales collateral: highlights[], metrics[{label,value,icon}], benefits[{title,desc}], relevance, growth[]
  details: jsonb('details'),
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
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  paystackRef: text('paystack_ref'),
  amountUsd: integer('amount_usd').notNull(),
  feeAmount: integer('fee_amount').notNull(),
  releasedAt: timestamp('released_at'),
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
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  paystackRef: text('paystack_ref'),
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
