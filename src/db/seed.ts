import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const postgres = require('postgres') as (url: string, options?: any) => any;

const DEMO_PASSWORD = 'Demo1234!';

const DEMO_LISTINGS = [
  {
    slug: 'modernrx-pos',
    title: 'ModernRx POS',
    tagline: 'Pharmacy point-of-sale trusted by independent pharmacies.',
    description:
      'A full-featured POS and pharmacy management system for independent and chain pharmacies. Prescription processing, inventory management, insurance billing, and patient records in one workflow.',
    category: 'saas' as const,
    acquisitionPrice: 15000,
    revenueMrr: 3200,
    revenueArr: 38400,
    techStack: ['Next.js', 'Fastify', 'PostgreSQL', 'Redis', 'Docker', 'Twilio'],
    demoUrl: '/images/modernrx.png',
    featured: true,
    verified: true,
    aiScore: 92,
    details: {
      highlights: [
        'Automated insurance claim processing',
        'Real-time inventory & expiry tracking',
        'HIPAA-compliant patient data management',
        'Multi-location support with central dashboard',
      ],
      metrics: [
        { label: 'Active Pharmacies', value: '38', icon: 'BarChart3' },
        { label: 'MRR', value: '$3,200', icon: 'DollarSign' },
        { label: 'Uptime SLA', value: '99.9%', icon: 'Zap' },
        { label: 'Profit Margin', value: '71%', icon: 'TrendingUp' },
        { label: 'Compliance', value: 'HIPAA', icon: 'Shield' },
        { label: 'Handover', value: '14 Days', icon: 'Clock' },
      ],
      benefits: [
        { title: 'Mission Critical Software', desc: 'Pharmacies cannot operate without a POS. Once integrated, churn is functionally zero.' },
        { title: 'Immediate Cash Flow', desc: 'Consistent $3.2k MRR with 71% net margins and minimal server overhead.' },
        { title: 'High Switching Costs', desc: 'Patient data migration and staff training create a massive moat against competitors.' },
      ],
      relevance:
        'Independent pharmacies are being squeezed by PBMs and need modern software to reduce overhead. ModernRx provides an enterprise-grade solution at a fraction of the cost of legacy on-premise systems.',
      growth: [
        'Upsell telemedicine and patient scheduling modules to existing clients.',
        'Launch an embedded capital/lending product for pharmacies.',
        'Expand sales motion to small chain pharmacies (5-20 locations).',
      ],
      images: ['/images/modernrx.png', '/images/aura.png', '/images/premium_hero_bg.png'],
    },
  },
  {
    slug: 'fortunaeats-pos',
    title: 'FortunaEats POS',
    tagline: 'Restaurant OS that turns tables faster.',
    description:
      'Restaurant management platform combining tableside ordering, kitchen display, delivery integrations, and analytics. Mobile-first, live in 48 hours.',
    category: 'pos' as const,
    acquisitionPrice: 8500,
    revenueMrr: 1800,
    revenueArr: 21600,
    techStack: ['React Native', 'Node.js', 'MongoDB', 'Socket.IO', 'Expo'],
    demoUrl: '/images/fortunaeats.png',
    featured: true,
    verified: true,
    aiScore: 88,
    details: {
      highlights: [
        'Tableside & kiosk ordering',
        'Live kitchen display system',
        '3rd-party delivery integrations',
        'Daily revenue & performance analytics',
      ],
      metrics: [
        { label: 'Active Restaurants', value: '24', icon: 'BarChart3' },
        { label: 'MRR', value: '$1,800', icon: 'DollarSign' },
        { label: 'Uptime SLA', value: '99.7%', icon: 'Zap' },
        { label: 'Profit Margin', value: '63%', icon: 'TrendingUp' },
        { label: 'Integrations', value: '5 Platforms', icon: 'Shield' },
        { label: 'Handover', value: '7 Days', icon: 'Clock' },
      ],
      benefits: [
        { title: 'Hardware Agnostic', desc: 'Runs on any iPad or Android tablet, drastically reducing onboarding friction.' },
        { title: 'Proven PMF', desc: 'Currently powering 24 active restaurants processing $2M+ in annualized GMV.' },
        { title: 'Turnkey Setup', desc: 'Fully automated onboarding flow allows restaurants to go live in under 48 hours.' },
      ],
      relevance:
        'Restaurants are suffering from app fatigue and high 3rd-party delivery fees. FortunaEats consolidates the stack, offering a unified hub that directly impacts their bottom line.',
      growth: [
        'Implement a per-transaction processing fee via a local payment provider.',
        'White-label the platform for ghost kitchens and virtual brands.',
        'Build a native consumer-facing loyalty app integration.',
      ],
      images: ['/images/fortunaeats.png', '/images/modernrx.png', '/images/openclaw.png'],
    },
  },
  {
    slug: 'openclaw-operations',
    title: 'OpenCLAW Operations',
    tagline: 'AI-powered operations automation for lean teams.',
    description:
      'Operations hub that automates recurring workflows, manages tasks, tracks KPIs and surfaces insights. Slack, Notion, Jira and Google Workspace integrations included.',
    category: 'saas' as const,
    monthlyLicensePrice: 99,
    revenueMrr: 10890,
    revenueArr: 130680,
    techStack: ['SvelteKit', 'NestJS', 'DynamoDB', 'OpenAI GPT-4', 'BullMQ', 'AWS Lambda'],
    demoUrl: '/images/openclaw.png',
    featured: false,
    verified: true,
    aiScore: 85,
    details: {
      highlights: [
        'Workflow automation engine',
        'AI-generated weekly ops reports',
        'KPI tracking & alerting',
        'Native Slack, Notion, Jira integrations',
      ],
      metrics: [
        { label: 'Active Teams', value: '110', icon: 'BarChart3' },
        { label: 'MRR', value: '$10,890', icon: 'DollarSign' },
        { label: 'Churn Rate', value: '1.8%', icon: 'TrendingUp' },
        { label: 'NPS Score', value: '72', icon: 'Shield' },
        { label: 'AI Workflows/mo', value: '50K+', icon: 'Zap' },
        { label: 'Plan Type', value: 'SaaS', icon: 'Clock' },
      ],
      benefits: [
        { title: 'Highly Scalable', desc: 'Serverless architecture handles 50K+ workflows seamlessly with near-zero devops.' },
        { title: 'Sticky Product', desc: 'Once a team builds their core workflows in OpenCLAW, churn drops to 1.8%.' },
        { title: 'B2B Cashflow', desc: 'Consistent five-figure MRR from reliable business clients.' },
      ],
      relevance:
        'Ops teams are cutting bloated, expensive SaaS tools. OpenCLAW acts as a lightweight, AI-first automation layer that unifies disjointed systems without the enterprise price tag.',
      growth: [
        "Launch a community 'recipe' marketplace for sharing automations.",
        'Introduce an Enterprise tier with SSO and dedicated VPCs.',
        'Expand native integrations to Salesforce and Workday.',
      ],
      images: ['/images/openclaw.png', '/images/aura.png', '/images/fortunaeats.png'],
    },
  },
  {
    slug: 'aura-ai-crm',
    title: 'Aura AI CRM',
    tagline: 'AI-native CRM that qualifies leads and closes deals autonomously.',
    description:
      'Pipeline management with GPT-powered lead scoring, personalized outreach sequences, call summaries, and real-time close-probability forecasting.',
    category: 'marketing' as const,
    acquisitionPrice: 25000,
    revenueMrr: 18500,
    revenueArr: 222000,
    techStack: ['Python', 'FastAPI', 'Supabase', 'Tailwind', 'OpenAI', 'Twilio', 'Resend'],
    demoUrl: '/images/aura.png',
    featured: true,
    verified: true,
    aiScore: 94,
    details: {
      highlights: [
        'AI lead scoring & qualification',
        'Automated personalized email sequences',
        'Call transcription & AI summaries',
        'Pipeline forecast with confidence scores',
      ],
      metrics: [
        { label: 'Active Seats', value: '215', icon: 'BarChart3' },
        { label: 'MRR', value: '$18,500', icon: 'DollarSign' },
        { label: 'Churn Rate', value: '2.1%', icon: 'TrendingUp' },
        { label: 'AI Actions/mo', value: '120K+', icon: 'Zap' },
        { label: 'Integrations', value: '12+', icon: 'Shield' },
        { label: 'Handover', value: '21 Days', icon: 'Clock' },
      ],
      benefits: [
        { title: 'Disruptive Technology', desc: 'First-mover advantage in the AI-native CRM space, heavily outperforming legacy tools.' },
        { title: 'High ACV Potential', desc: 'Sales teams are willing to pay a premium for software that demonstrably increases close rates.' },
        { title: 'Rich Proprietary Data', desc: 'Access to millions of sales interactions used to fine-tune bespoke models.' },
      ],
      relevance:
        'The CRM market is vast but stagnant. Aura AI captures the budget shift from manual BDRs to AI-augmented sales intelligence, offering a 10x ROI for mid-market sales teams.',
      growth: [
        'Develop a voice-AI agent for automated cold-calling.',
        'Build deep, bi-directional sync with Salesforce and HubSpot to act as a co-pilot.',
        'Target agencies and brokerages with customized vertical models.',
      ],
      images: ['/images/aura.png', '/images/openclaw.png', '/images/premium_hero_bg.png'],
    },
  },
  {
    slug: 'nova-ledger-web3',
    title: 'Nova Ledger Web3',
    tagline: 'Battle-tested DeFi accounting with multi-chain treasury management.',
    description:
      'Web3-native financial platform for on-chain accounting, treasury management and audit-ready reporting across 8 EVM chains.',
    category: 'blockchain' as const,
    acquisitionPrice: 45000,
    revenueMrr: 9400,
    revenueArr: 112800,
    techStack: ['Solidity', 'Next.js', 'Hardhat', 'The Graph', 'ethers.js', 'Prisma', 'PostgreSQL'],
    demoUrl: '/images/premium_hero_bg.png',
    featured: false,
    verified: true,
    aiScore: 81,
    details: {
      highlights: [
        'Multi-chain treasury dashboard',
        'Auto-reconciled wallet accounting',
        'GAAP-compliant audit reports',
        'DAO governance & multisig integration',
      ],
      metrics: [
        { label: 'DAOs Onboarded', value: '47', icon: 'BarChart3' },
        { label: 'TVL Tracked', value: '$120M+', icon: 'DollarSign' },
        { label: 'Chains Supported', value: '8', icon: 'Zap' },
        { label: 'Audit Reports/mo', value: '340', icon: 'TrendingUp' },
        { label: 'Security Audits', value: '3 Passed', icon: 'Shield' },
        { label: 'Handover', value: '30 Days', icon: 'Clock' },
      ],
      benefits: [
        { title: 'Deep Technical Moat', desc: 'Complex on-chain indexers and reconciliation engines that take years to replicate.' },
        { title: 'Blue Ocean Market', desc: 'Few competitors can provide true GAAP compliance for multi-chain crypto treasuries.' },
        { title: 'High-Ticket Enterprise', desc: 'DAOs and crypto foundations sign $50k+ annual contracts for this level of auditing.' },
      ],
      relevance:
        'As regulatory scrutiny increases, crypto companies and DAOs are desperate for institutional-grade accounting. Nova Ledger solves an existential pain point for Web3 treasuries.',
      growth: [
        'Launch a native governance token to decentralize the indexing protocol.',
        'Integrate fiat off-ramps and TradFi bank APIs for complete reconciliation.',
        'Expand support to non-EVM chains like Solana and Cosmos.',
      ],
      images: ['/images/premium_hero_bg.png', '/images/aura.png', '/images/openclaw.png'],
    },
  },
  {
    slug: 'chatcraft-prompt-hub',
    title: 'ChatCraft Prompt Hub',
    tagline: 'Prompt engineering platform for teams building with LLMs.',
    description:
      'Collaborative prompt management with versioned libraries, A/B testing, team access controls and a production API.',
    category: 'saas' as const,
    monthlyLicensePrice: 29,
    revenueMrr: 9280,
    revenueArr: 111360,
    techStack: ['OpenAI GPT-4', 'Next.js', 'Redis', 'Prisma', 'PostgreSQL', 'Vercel AI SDK'],
    demoUrl: '/images/modernrx.png',
    featured: false,
    verified: true,
    aiScore: 86,
    details: {
      highlights: [
        'Versioned prompt library with diff view',
        'A/B testing framework for LLM outputs',
        'API-first for production injection',
        'Team roles & shared workspaces',
      ],
      metrics: [
        { label: 'Active Teams', value: '320', icon: 'BarChart3' },
        { label: 'MRR', value: '$9,280', icon: 'DollarSign' },
        { label: 'Churn Rate', value: '1.2%', icon: 'TrendingUp' },
        { label: 'Prompts Stored', value: '500K+', icon: 'Zap' },
        { label: 'Plan Type', value: 'SaaS', icon: 'Clock' },
      ],
      benefits: [
        { title: 'Immediate Cash Flow', desc: 'Generating nearly $10k MRR with highly sticky enterprise clients and exceptionally low churn.' },
        { title: 'Defensible Moat', desc: 'Proprietary prompt-diffing engine and built-in A/B testing infrastructure that took 14 months to engineer.' },
        { title: 'Turnkey Operations', desc: 'Fully automated billing and self-serve onboarding. Requires less than 5 hours of maintenance a week.' },
        { title: 'High-Margin Infrastructure', desc: 'Optimized serverless architecture costing less than $200/mo, maintaining a 90%+ profit margin.' },
      ],
      relevance:
        "The Generative AI market is exploding, but enterprise teams are struggling with 'prompt drift' and inconsistent LLM outputs in production. ChatCraft solves this by providing a unified Git-like version control system for prompts.",
      growth: [
        'Enterprise Sales Motion: Move upmarket by introducing SOC2 compliance and SSO, increasing ACV from $29/mo to $499/mo per team.',
        'Marketplace Integration: Launch a public prompt marketplace where creators can sell specialized prompts, taking a 20% platform fee.',
        'SDK Expansion: Release native SDKs for Python and Go (currently only TS/JS) to capture backend engineering teams.',
      ],
      images: ['/images/modernrx.png', '/images/premium_hero_bg.png', '/images/fortunaeats.png'],
    },
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(url, { max: 5 });
  const db = drizzle(sql, { schema });
  const password = await bcrypt.hash(DEMO_PASSWORD, 12);

  const ensureUser = async (email: string, role: 'buyer' | 'seller' | 'admin' | 'broker') => {
    const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (existing.length) return existing[0];
    const inserted = await db
      .insert(schema.users)
      .values({ email, password, role })
      .returning();
    await db.insert(schema.profiles).values({ userId: inserted[0].id }).catch(() => {});
    console.log(`  created user ${email} (${role})`);
    return inserted[0];
  };

  console.log('Seeding users...');
  const seller = await ensureUser('seller@dfortuna.demo', 'seller');
  await ensureUser('buyer@dfortuna.demo', 'buyer');
  await ensureUser('broker@dfortuna.demo', 'broker');
  await ensureUser('admin@dfortuna.demo', 'admin');

  console.log('Seeding listings...');
  for (const l of DEMO_LISTINGS) {
    const existing = await db
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.slug, l.slug))
      .limit(1);
    if (existing.length) {
      await db
        .update(schema.listings)
        .set({ 
          details: l.details,
          description: l.description,
          title: l.title,
          tagline: l.tagline,
          category: l.category,
          acquisitionPrice: l.acquisitionPrice,
          revenueMrr: l.revenueMrr,
          revenueArr: l.revenueArr,
          demoUrl: l.demoUrl,
          monthlyLicensePrice: (l as any).monthlyLicensePrice
        })
        .where(eq(schema.listings.id, existing[0].id));
      console.log(`  updated details for ${l.slug}`);
      continue;
    }
    await db.insert(schema.listings).values({
      ...l,
      sellerId: seller.id,
      status: 'live',
      publishedAt: new Date(),
    });
    console.log(`  created listing ${l.slug}`);
  }

  console.log(`\nDone. Demo logins (password: ${DEMO_PASSWORD}):`);
  console.log('  seller@dfortuna.demo / buyer@dfortuna.demo / broker@dfortuna.demo / admin@dfortuna.demo');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
