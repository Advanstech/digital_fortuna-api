import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, sql, gte, lte, ne } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';

// ── Industry benchmark data ──────────────────────────────────────────────
// Derived from Valzura, SaasCEO, Empire Flippers, and DealFlowSource 2025-2026 data
const CATEGORY_MULTIPLES: Record<string, { sde: [number, number]; ebitda: [number, number]; arr: [number, number] }> = {
  saas:       { sde: [3.0, 6.0], ebitda: [10, 20], arr: [3.0, 8.0] },
  pos:        { sde: [2.5, 4.5], ebitda: [8, 14],  arr: [2.0, 5.0] },
  mobile:     { sde: [2.0, 4.0], ebitda: [6, 12],  arr: [2.0, 4.5] },
  fintech:    { sde: [3.5, 7.0], ebitda: [12, 25], arr: [4.0, 10.0] },
  ecommerce:  { sde: [2.0, 4.0], ebitda: [6, 12],  arr: [1.5, 3.5] },
  blockchain: { sde: [2.0, 5.0], ebitda: [8, 16],  arr: [2.5, 6.0] },
  edtech:     { sde: [2.5, 5.0], ebitda: [8, 16],  arr: [2.5, 6.0] },
  marketing:  { sde: [2.0, 4.0], ebitda: [6, 12],  arr: [2.0, 4.5] },
  other:      { sde: [2.0, 4.0], ebitda: [6, 12],  arr: [2.0, 4.5] },
};

// Growth profile adjustments
function growthMultiplier(growthRate: number): number {
  if (growthRate > 100) return 1.4;
  if (growthRate > 60)  return 1.25;
  if (growthRate > 40)  return 1.15;
  if (growthRate > 20)  return 1.0;
  if (growthRate > 0)   return 0.9;
  return 0.7; // declining
}

// Churn penalty
function churnAdjustment(monthlyChurnPct: number): number {
  if (monthlyChurnPct <= 1) return 1.1;  // excellent
  if (monthlyChurnPct <= 3) return 1.0;  // good
  if (monthlyChurnPct <= 5) return 0.9;  // acceptable
  if (monthlyChurnPct <= 8) return 0.75; // concerning
  return 0.6; // high churn
}

export interface ValuationInput {
  // Revenue
  revenueMrr?: number;
  revenueArr?: number;
  // Financials (monthly averages or trailing 12-month)
  totalRevenue?: number;    // trailing 12-month
  totalExpenses?: number;   // trailing 12-month
  ownerSalary?: number;     // owner comp to add back for SDE
  // Growth
  revenueGrowthPct?: number; // YoY or trailing growth %
  monthlyChurnPct?: number;
  // Listing metadata
  category: string;
  // Optional overrides
  profitMarginPct?: number;
  customerCount?: number;
  foundedYear?: number;
}

export interface ValuationReport {
  // Core values
  sdeValuation: { min: number; max: number; multipleLow: number; multipleHigh: number };
  ebitdaValuation: { min: number; max: number; multipleLow: number; multipleHigh: number };
  arrValuation: { min: number; max: number; multipleLow: number; multipleHigh: number };
  // Composite
  estimatedValuationMin: number;
  estimatedValuationMax: number;
  recommendedListPrice: number;
  primaryMethod: 'SDE' | 'EBITDA' | 'ARR';
  // Computed metrics
  sde: number;
  ebitda: number;
  arr: number;
  grossMarginPct: number;
  netMarginPct: number;
  ruleOf40Score: number;
  ruleOf40Verdict: string;
  growthAdjustment: number;
  churnAdjustment: number;
  // Narrative
  methodology: string;
  factors: string[];
  risks: string[];
  comparableContext: string;
}

@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private aiService: AiService,
  ) {}

  /**
   * Run a deterministic multi-method valuation on a listing.
   * Uses SDE, EBITDA, and ARR multiples with growth/churn adjustments.
   */
  async valuateListing(listingId: string): Promise<ValuationReport> {
    const listings = await this.db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
    if (!listings.length) throw new NotFoundException('Listing not found');
    const listing = listings[0];

    // Load financial records for trailing 12 months
    const financials = await this.db
      .select()
      .from(schema.financialRecords)
      .where(eq(schema.financialRecords.listingId, listingId))
      .orderBy(desc(schema.financialRecords.createdAt));

    const input = this.buildInputFromListing(listing, financials);
    const report = this.computeValuation(input);

    // Save the report
    await this.db.insert(schema.aiBrokerReports).values({
      listingId,
      reportType: 'valuation',
      content: report,
    });

    // Update listing AI score based on valuation quality
    const aiScore = this.computeAiScore(report, input);
    await this.db.update(schema.listings).set({ aiScore }).where(eq(schema.listings.id, listingId));

    return report;
  }

  /**
   * Quick inline valuation (no DB save) — used by the sell wizard.
   */
  computeQuickValuation(input: ValuationInput): ValuationReport {
    return this.computeValuation(input);
  }

  /**
   * AI-enriched valuation that combines formula + LLM narrative.
   */
  async valuateWithAiNarrative(listingId: string): Promise<ValuationReport & { aiNarrative: string }> {
    const report = await this.valuateListing(listingId);
    
    const listings = await this.db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
    const listing = listings[0];
    
    // Get comparable listings in the same category and price range
    const comparables = await this.findComparables(listing);

    const aiNarrative = await this.aiService.generateValuationNarrative(listing, report, comparables);

    return { ...report, aiNarrative };
  }

  private buildInputFromListing(listing: any, financials: any[]): ValuationInput {
    const mrr = listing.revenueMrr || 0;
    const arr = listing.revenueArr || mrr * 12;

    let totalRevenue = arr;
    let totalExpenses = 0;

    if (financials.length > 0) {
      // Use actual trailing 12 months if available
      const recent = financials.slice(0, 12);
      totalRevenue = recent.reduce((sum: number, f: any) => sum + (f.revenue || 0), 0);
      totalExpenses = recent.reduce((sum: number, f: any) => sum + (f.expenses || 0), 0);
      // Annualize if we have less than 12 months
      if (recent.length < 12 && recent.length > 0) {
        const factor = 12 / recent.length;
        totalRevenue = Math.round(totalRevenue * factor);
        totalExpenses = Math.round(totalExpenses * factor);
      }
    }

    return {
      revenueMrr: mrr,
      revenueArr: arr,
      totalRevenue,
      totalExpenses,
      ownerSalary: 0, // conservative — buyer can adjust
      category: listing.category || 'other',
    };
  }

  private computeValuation(input: ValuationInput): ValuationReport {
    const category = input.category || 'other';
    const multiples = CATEGORY_MULTIPLES[category] || CATEGORY_MULTIPLES.other;

    // ── Compute core metrics ───────────────────────────────────────
    const arr = input.revenueArr || (input.revenueMrr || 0) * 12;
    const totalRevenue = input.totalRevenue || arr;
    const totalExpenses = input.totalExpenses || Math.round(totalRevenue * 0.4); // assume 60% margin if unknown
    const ownerSalary = input.ownerSalary || 0;

    const netIncome = totalRevenue - totalExpenses;
    const sde = netIncome + ownerSalary; // Seller's Discretionary Earnings
    const ebitda = netIncome; // Simplified — no D&A for software businesses

    const grossMarginPct = totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 100) : 0;
    const netMarginPct = totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 100) : 0;

    // ── Growth & churn adjustments ─────────────────────────────────
    const growthRate = input.revenueGrowthPct ?? 15; // default moderate
    const churnRate = input.monthlyChurnPct ?? 3; // default acceptable
    const gAdj = growthMultiplier(growthRate);
    const cAdj = churnAdjustment(churnRate);
    const combinedAdj = gAdj * cAdj;

    // ── Rule of 40 ────────────────────────────────────────────────
    const ruleOf40Score = growthRate + netMarginPct;
    const ruleOf40Verdict = ruleOf40Score >= 40
      ? 'Excellent — exceeds Rule of 40'
      : ruleOf40Score >= 25
        ? 'Good — approaching Rule of 40'
        : 'Below Rule of 40 — growth or margins need improvement';

    // ── SDE Valuation ──────────────────────────────────────────────
    const sdeLow = multiples.sde[0] * combinedAdj;
    const sdeHigh = multiples.sde[1] * combinedAdj;
    const sdeValuation = {
      min: Math.round(sde * sdeLow),
      max: Math.round(sde * sdeHigh),
      multipleLow: Math.round(sdeLow * 100) / 100,
      multipleHigh: Math.round(sdeHigh * 100) / 100,
    };

    // ── EBITDA Valuation ───────────────────────────────────────────
    const ebitdaLow = multiples.ebitda[0] * combinedAdj;
    const ebitdaHigh = multiples.ebitda[1] * combinedAdj;
    const ebitdaValuation = {
      min: Math.round(ebitda * ebitdaLow),
      max: Math.round(ebitda * ebitdaHigh),
      multipleLow: Math.round(ebitdaLow * 100) / 100,
      multipleHigh: Math.round(ebitdaHigh * 100) / 100,
    };

    // ── ARR Valuation ──────────────────────────────────────────────
    const arrLow = multiples.arr[0] * combinedAdj;
    const arrHigh = multiples.arr[1] * combinedAdj;
    const arrValuation = {
      min: Math.round(arr * arrLow),
      max: Math.round(arr * arrHigh),
      multipleLow: Math.round(arrLow * 100) / 100,
      multipleHigh: Math.round(arrHigh * 100) / 100,
    };

    // ── Choose primary method ──────────────────────────────────────
    // SDE for < $500k ARR, ARR for > $1M, EBITDA for scaled businesses
    let primaryMethod: 'SDE' | 'EBITDA' | 'ARR' = 'SDE';
    if (arr > 1_000_000) primaryMethod = 'ARR';
    else if (arr > 500_000 && ebitda > 100_000) primaryMethod = 'EBITDA';

    // ── Composite valuation ────────────────────────────────────────
    // Weighted average of all three methods
    const weights = primaryMethod === 'SDE' ? [0.5, 0.2, 0.3]
      : primaryMethod === 'ARR' ? [0.15, 0.25, 0.6]
      : [0.2, 0.5, 0.3];

    const compositeMin = Math.round(
      sdeValuation.min * weights[0] + ebitdaValuation.min * weights[1] + arrValuation.min * weights[2]
    );
    const compositeMax = Math.round(
      sdeValuation.max * weights[0] + ebitdaValuation.max * weights[1] + arrValuation.max * weights[2]
    );

    // Recommended list price: 70th percentile of range
    const recommendedListPrice = Math.round(compositeMin + (compositeMax - compositeMin) * 0.7);

    // ── Build factors and risks ────────────────────────────────────
    const factors: string[] = [];
    const risks: string[] = [];

    if (ruleOf40Score >= 40) factors.push(`Rule of 40 score of ${ruleOf40Score} signals a premium-quality business`);
    if (growthRate > 40) factors.push(`High growth rate (${growthRate}% YoY) justifies premium multiples`);
    if (netMarginPct > 70) factors.push(`Outstanding ${netMarginPct}% net margin typical of scalable software`);
    if (arr > 100_000) factors.push(`ARR of $${(arr / 1000).toFixed(0)}k demonstrates product-market fit`);
    if (category === 'saas') factors.push('SaaS businesses command premium multiples due to recurring revenue');
    if (category === 'fintech') factors.push('Fintech carries premium multiples due to regulatory moat');

    if (growthRate < 10) risks.push('Low growth rate may limit buyer interest');
    if (churnRate > 5) risks.push(`Monthly churn of ${churnRate}% erodes lifetime value`);
    if (netMarginPct < 20) risks.push('Thin margins reduce owner earnings and SDE-based valuation');
    if (arr < 50_000) risks.push('Sub-$50k ARR limits the buyer pool to individual operators');

    const methodology = `Valuation computed using a weighted ${primaryMethod}-primary approach combining SDE (${(weights[0] * 100).toFixed(0)}%), EBITDA (${(weights[1] * 100).toFixed(0)}%), and ARR (${(weights[2] * 100).toFixed(0)}%) multiples. Multiples sourced from comparable M&A transactions in the ${category} category (2025-2026 data), adjusted for growth rate (${growthRate}% → ${gAdj.toFixed(2)}x) and churn (${churnRate}% → ${cAdj.toFixed(2)}x).`;

    const comparableContext = `Based on ${category.toUpperCase()} benchmarks: SDE multiples range ${multiples.sde[0]}x–${multiples.sde[1]}x, EBITDA ${multiples.ebitda[0]}x–${multiples.ebitda[1]}x, ARR ${multiples.arr[0]}x–${multiples.arr[1]}x. After growth/churn adjustment (${combinedAdj.toFixed(2)}x), applied to your financials.`;

    return {
      sdeValuation,
      ebitdaValuation,
      arrValuation,
      estimatedValuationMin: compositeMin,
      estimatedValuationMax: compositeMax,
      recommendedListPrice,
      primaryMethod,
      sde,
      ebitda,
      arr,
      grossMarginPct,
      netMarginPct,
      ruleOf40Score,
      ruleOf40Verdict,
      growthAdjustment: gAdj,
      churnAdjustment: cAdj,
      methodology,
      factors,
      risks,
      comparableContext,
    };
  }

  private computeAiScore(report: ValuationReport, input: ValuationInput): number {
    let score = 50; // baseline
    if (report.ruleOf40Score >= 40) score += 15;
    else if (report.ruleOf40Score >= 25) score += 8;
    if (report.netMarginPct > 60) score += 10;
    else if (report.netMarginPct > 30) score += 5;
    if (report.arr > 100_000) score += 10;
    if ((input.revenueGrowthPct ?? 15) > 30) score += 10;
    if ((input.monthlyChurnPct ?? 3) <= 2) score += 5;
    return Math.min(100, Math.max(0, score));
  }

  private async findComparables(listing: any) {
    const price = listing.acquisitionPrice || 0;
    const minPrice = Math.round(price * 0.5);
    const maxPrice = Math.round(price * 2);

    return this.db
      .select({
        title: schema.listings.title,
        category: schema.listings.category,
        acquisitionPrice: schema.listings.acquisitionPrice,
        revenueMrr: schema.listings.revenueMrr,
        revenueArr: schema.listings.revenueArr,
        status: schema.listings.status,
      })
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.category, listing.category),
          ne(schema.listings.id, listing.id),
          gte(schema.listings.acquisitionPrice, minPrice),
          lte(schema.listings.acquisitionPrice, maxPrice),
        ),
      )
      .limit(5);
  }
}
