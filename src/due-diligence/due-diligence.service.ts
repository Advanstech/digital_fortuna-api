import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';

const STAFF_ROLES = new Set(['admin', 'super_admin', 'broker', 'legal', 'bank']);

@Injectable()
export class DueDiligenceService {
  private readonly logger = new Logger(DueDiligenceService.name);

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private aiService: AiService,
  ) {}

  private async getDealParticipant(dealId: string, userId: string, role?: string) {
    const deals = await this.db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
    if (!deals.length) throw new NotFoundException('Deal not found');
    const deal = deals[0];
    const isParticipant = deal.buyerId === userId || deal.sellerId === userId || (role ? STAFF_ROLES.has(role) : false);
    if (!isParticipant) throw new ForbiddenException('You are not a participant in this deal');
    return deal;
  }

  /**
   * Create or retrieve the DD room for a deal. Auto-generates an AI checklist.
   */
  async getOrCreateRoom(dealId: string, userId: string, role?: string) {
    const deal = await this.getDealParticipant(dealId, userId, role);

    // Check for existing room
    const existing = await this.db
      .select()
      .from(schema.dueDiligenceRooms)
      .where(eq(schema.dueDiligenceRooms.dealId, dealId))
      .limit(1);

    if (existing.length) {
      const room = existing[0];
      const items = await this.db
        .select()
        .from(schema.dueDiligenceChecklistItems)
        .where(eq(schema.dueDiligenceChecklistItems.roomId, room.id))
        .orderBy(asc(schema.dueDiligenceChecklistItems.category));
      const documents = await this.db
        .select()
        .from(schema.dueDiligenceDocuments)
        .where(eq(schema.dueDiligenceDocuments.roomId, room.id))
        .orderBy(desc(schema.dueDiligenceDocuments.createdAt));
      return { ...room, items, documents };
    }

    // Load listing for AI context
    const listings = await this.db.select().from(schema.listings).where(eq(schema.listings.id, deal.listingId)).limit(1);
    const listing = listings[0] || { title: 'Unknown', category: 'other' };

    // Generate AI checklist
    let checklistData: any;
    try {
      checklistData = await this.aiService.generateDueDiligenceChecklist(listing, deal);
    } catch (err) {
      this.logger.warn(`AI DD checklist generation failed: ${(err as Error).message}`);
      checklistData = this.getDefaultChecklist();
    }

    // Create room
    const inserted = await this.db.insert(schema.dueDiligenceRooms).values({
      dealId,
      status: 'open',
      checklistData,
    }).returning();
    const room = inserted[0];

    // Populate checklist items from AI response
    const categories = checklistData.categories || [];
    for (const cat of categories) {
      for (const item of (cat.items || [])) {
        await this.db.insert(schema.dueDiligenceChecklistItems).values({
          roomId: room.id,
          category: cat.name,
          item: item.item,
          description: item.description || '',
          priority: item.priority || 'medium',
          status: 'pending',
        });
      }
    }

    const items = await this.db
      .select()
      .from(schema.dueDiligenceChecklistItems)
      .where(eq(schema.dueDiligenceChecklistItems.roomId, room.id))
      .orderBy(asc(schema.dueDiligenceChecklistItems.category));

    return { ...room, items, documents: [] };
  }

  /**
   * Update a checklist item status.
   */
  async updateChecklistItem(
    itemId: string,
    dealId: string,
    userId: string,
    role: string | undefined,
    update: { status?: string; notes?: string; documentId?: string },
  ) {
    await this.getDealParticipant(dealId, userId, role);

    const items = await this.db
      .select()
      .from(schema.dueDiligenceChecklistItems)
      .where(eq(schema.dueDiligenceChecklistItems.id, itemId))
      .limit(1);
    if (!items.length) throw new NotFoundException('Checklist item not found');

    const updates: any = {};
    if (update.status) {
      updates.status = update.status;
      if (update.status === 'completed') {
        updates.completedBy = userId;
        updates.completedAt = new Date();
      }
    }
    if (update.notes !== undefined) updates.notes = update.notes;
    if (update.documentId) updates.documentId = update.documentId;

    const updated = await this.db
      .update(schema.dueDiligenceChecklistItems)
      .set(updates)
      .where(eq(schema.dueDiligenceChecklistItems.id, itemId))
      .returning();

    // Recalculate completion percentage
    const roomId = items[0].roomId;
    await this.recalculateCompletion(roomId);

    return updated[0];
  }

  /**
   * Upload a document to the DD room.
   */
  async addDocument(
    dealId: string,
    userId: string,
    role: string | undefined,
    doc: { category: string; fileName: string; fileUrl: string; fileSize?: number; mimeType?: string },
  ) {
    const deal = await this.getDealParticipant(dealId, userId, role);

    const rooms = await this.db
      .select()
      .from(schema.dueDiligenceRooms)
      .where(eq(schema.dueDiligenceRooms.dealId, dealId))
      .limit(1);
    if (!rooms.length) throw new BadRequestException('Create the DD room first');

    const inserted = await this.db.insert(schema.dueDiligenceDocuments).values({
      roomId: rooms[0].id,
      uploadedBy: userId,
      category: doc.category,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      status: 'pending_review',
    }).returning();

    return inserted[0];
  }

  /**
   * Review a document (approve/flag/reject) — staff/seller only.
   */
  async reviewDocument(
    documentId: string,
    dealId: string,
    userId: string,
    role: string | undefined,
    review: { status: string; reviewNotes?: string },
  ) {
    await this.getDealParticipant(dealId, userId, role);

    const docs = await this.db
      .select()
      .from(schema.dueDiligenceDocuments)
      .where(eq(schema.dueDiligenceDocuments.id, documentId))
      .limit(1);
    if (!docs.length) throw new NotFoundException('Document not found');

    const updated = await this.db
      .update(schema.dueDiligenceDocuments)
      .set({ status: review.status, reviewNotes: review.reviewNotes })
      .where(eq(schema.dueDiligenceDocuments.id, documentId))
      .returning();

    return updated[0];
  }

  private async recalculateCompletion(roomId: string) {
    const items = await this.db
      .select({ status: schema.dueDiligenceChecklistItems.status })
      .from(schema.dueDiligenceChecklistItems)
      .where(eq(schema.dueDiligenceChecklistItems.roomId, roomId));

    if (!items.length) return;

    const completed = items.filter(i => i.status === 'completed' || i.status === 'waived').length;
    const pct = Math.round((completed / items.length) * 100);

    await this.db
      .update(schema.dueDiligenceRooms)
      .set({ completionPct: pct, updatedAt: new Date() })
      .where(eq(schema.dueDiligenceRooms.id, roomId));
  }

  private getDefaultChecklist() {
    return {
      title: 'Due Diligence Checklist',
      documentType: 'dd_checklist',
      categories: [
        {
          name: 'Financial',
          items: [
            { item: 'Profit & Loss statements (trailing 24 months)', description: 'Monthly or quarterly P&L', priority: 'critical' },
            { item: 'Bank statements (trailing 12 months)', description: 'All business bank accounts', priority: 'critical' },
            { item: 'Revenue breakdown by product/tier', description: 'MRR/ARR by plan or customer segment', priority: 'high' },
            { item: 'Customer churn data', description: 'Monthly churn rate with cohort analysis', priority: 'high' },
            { item: 'Accounts receivable aging', description: 'Outstanding invoices by age', priority: 'medium' },
            { item: 'Tax returns (last 2 years)', description: 'Federal and state/local returns', priority: 'critical' },
          ],
        },
        {
          name: 'Legal',
          items: [
            { item: 'Corporate formation documents', description: 'Articles, bylaws, operating agreement', priority: 'critical' },
            { item: 'Customer contracts/ToS', description: 'Standard terms of service and any enterprise contracts', priority: 'high' },
            { item: 'Vendor and supplier agreements', description: 'API providers, hosting, SaaS subscriptions', priority: 'medium' },
            { item: 'Employee/contractor agreements', description: 'Employment contracts, IP assignment clauses', priority: 'high' },
            { item: 'Pending or threatened litigation', description: 'Any legal disputes or claims', priority: 'critical' },
            { item: 'Data privacy compliance', description: 'GDPR, CCPA, data processing agreements', priority: 'high' },
          ],
        },
        {
          name: 'Technical',
          items: [
            { item: 'Source code access', description: 'Repository access for code review', priority: 'critical' },
            { item: 'Architecture documentation', description: 'System design, infrastructure diagrams', priority: 'high' },
            { item: 'CI/CD pipeline review', description: 'Build, test, deployment processes', priority: 'medium' },
            { item: 'Security audit / pen test results', description: 'Most recent security assessment', priority: 'high' },
            { item: 'Infrastructure inventory', description: 'Servers, domains, SSL certs, DNS, CDN', priority: 'high' },
            { item: 'Technical debt assessment', description: 'Known issues, refactoring needs', priority: 'medium' },
          ],
        },
        {
          name: 'Operational',
          items: [
            { item: 'Team structure and roles', description: 'Current employees, contractors, their roles', priority: 'high' },
            { item: 'Standard operating procedures', description: 'SOPs for support, onboarding, deployment', priority: 'medium' },
            { item: 'Key person dependency analysis', description: 'Identify single points of failure', priority: 'high' },
            { item: 'Vendor transition plan', description: 'Steps to transfer accounts and access', priority: 'medium' },
          ],
        },
        {
          name: 'Customer',
          items: [
            { item: 'Customer list (anonymized)', description: 'Number of customers, segments, geography', priority: 'high' },
            { item: 'Top 10 customer revenue concentration', description: 'Percentage of revenue from largest customers', priority: 'critical' },
            { item: 'Net Promoter Score or satisfaction data', description: 'Customer feedback and reviews', priority: 'medium' },
            { item: 'Customer acquisition cost (CAC)', description: 'Historical CAC by channel', priority: 'medium' },
          ],
        },
        {
          name: 'Intellectual Property',
          items: [
            { item: 'Trademark and domain registrations', description: 'All registered trademarks, domain names', priority: 'high' },
            { item: 'Patent applications or grants', description: 'Any filed or granted patents', priority: 'medium' },
            { item: 'Open source license audit', description: 'List of OSS dependencies and their licenses', priority: 'high' },
            { item: 'IP assignment documentation', description: 'Proof all IP is owned by the company', priority: 'critical' },
          ],
        },
      ],
      estimatedCompletionDays: 30,
      disclaimer: 'This checklist is a starting point. Consult with your M&A attorney and accountant for deal-specific requirements.',
    };
  }
}
