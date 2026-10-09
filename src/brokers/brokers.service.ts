import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class BrokersService {
  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private aiService: AiService,
    private mailService: MailService,
  ) {}

  async addFinancialRecord(listingId: string, monthYear: string, revenue: number, expenses: number, rawInput?: any) {
    const netIncome = revenue - expenses;
    const record = await this.db.insert(schema.financialRecords).values({
      listingId,
      monthYear,
      revenue,
      expenses,
      netIncome,
      rawInput,
    }).returning();
    return record[0];
  }

  async buildPnL(rawInputText: string) {
    return this.aiService.buildPnLStatement(rawInputText);
  }

  async generateValuation(listingId: string) {
    const listings = await this.db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
    if (!listings.length) throw new NotFoundException('Listing not found');
    const listing = listings[0];

    const financials = await this.db.select().from(schema.financialRecords).where(eq(schema.financialRecords.listingId, listingId));

    const valuation = await this.aiService.generateBusinessValuation(listing, financials);

    // Save report
    const report = await this.db.insert(schema.aiBrokerReports).values({
      listingId,
      reportType: 'valuation',
      content: valuation,
    }).returning();

    return report[0];
  }

  async generateCIM(listingId: string) {
    const listings = await this.db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
    if (!listings.length) throw new NotFoundException('Listing not found');
    const listing = listings[0];

    // Get latest valuation and financials
    const financials = await this.db.select().from(schema.financialRecords).where(eq(schema.financialRecords.listingId, listingId));
    let valuation = await this.db.select().from(schema.aiBrokerReports).where(and(eq(schema.aiBrokerReports.listingId, listingId), eq(schema.aiBrokerReports.reportType, 'valuation'))).limit(1);
    
    let valuationData = valuation.length ? valuation[0].content : { estimatedValuationMin: 0, estimatedValuationMax: 0 };
    
    const cimText = await this.aiService.generateCIM(listing, valuationData, financials);

    // Save report
    const report = await this.db.insert(schema.aiBrokerReports).values({
      listingId,
      reportType: 'cim',
      content: { text: cimText },
    }).returning();

    return report[0];
  }

  async setBuyerMandate(buyerId: string, targetCategories: string[], minMrr: number, maxBudget: number, preferences: string) {
    const mandate = await this.db.insert(schema.buyerMandates).values({
      buyerId,
      targetCategories,
      minMrr,
      maxBudget,
      preferences,
    }).returning();
    return mandate[0];
  }

  async findMatchingBuyers(listingId: string) {
    const listings = await this.db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
    if (!listings.length) throw new NotFoundException('Listing not found');
    const listing = listings[0];

    // Get all mandates (in a real app, we'd pre-filter via SQL)
    const mandates = await this.db.select().from(schema.buyerMandates);
    if (!mandates.length) return [];

    const matches = await this.aiService.matchBuyers(listing, mandates);
    return matches;
  }

  async contactBroker(userId: string, email: string, message: string) {
    // Send email notification to the assigned broker (mocked as general broker email for now)
    const brokerEmail = 'broker@digitalfortuna.test';
    
    await this.mailService.sendEmail(
      brokerEmail, 
      `New Broker Inquiry from ${email}`, 
      `<div style="font-family: sans-serif; max-width: 600px;">
        <h2>New Inquiry Received</h2>
        <p><strong>User ID:</strong> ${userId}</p>
        <p><strong>User Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="border-left: 4px solid #00FF85; padding-left: 10px; color: #555;">${message}</blockquote>
        <br />
        <p>Please log in to the admin panel to respond.</p>
      </div>`
    ).catch(err => {
      // We log error but don't fail the request so user gets success message
      console.error(`Failed to send broker notification email: ${err.message}`);
    });
    
    return { success: true, message: 'Broker notified successfully' };
  }
}
