import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, or, asc, desc, ne } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';

type DealStatus = 'negotiation' | 'loi_signed' | 'due_diligence' | 'apa_signed' | 'escrow' | 'closed' | 'cancelled';

const DEAL_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  negotiation: ['loi_signed', 'due_diligence', 'cancelled'],
  loi_signed: ['due_diligence', 'cancelled'],
  due_diligence: ['apa_signed', 'cancelled'],
  apa_signed: ['escrow', 'cancelled'],
  escrow: ['closed', 'cancelled'],
  closed: [],
  cancelled: ['negotiation'],
};

const STAFF_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'root', 'broker', 'legal', 'bank']);

@Injectable()
export class DealsService {
  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private aiService: AiService,
    private notificationsService: NotificationsService,
  ) {}

  private isParticipant(deal: any, userId: string, role?: string) {
    return deal.buyerId === userId || deal.sellerId === userId || (role ? STAFF_ROLES.has(role) : false);
  }

  async createDeal(listingId: string, buyerId: string, agreedPrice?: number) {
    const listings = await this.db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, listingId))
      .limit(1);
    if (!listings.length) throw new NotFoundException('Listing not found');

    const listing = listings[0];
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('You cannot open a deal on your own listing');
    }
    if (listing.status !== 'live') {
      throw new BadRequestException('This listing is not available for deals');
    }

    // Reuse an active deal room if one already exists for this buyer + listing
    const existing = await this.db
      .select()
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.listingId, listingId),
          eq(schema.deals.buyerId, buyerId),
          ne(schema.deals.status, 'cancelled'),
          ne(schema.deals.status, 'closed'),
        ),
      )
      .limit(1);

    if (existing.length) return existing[0];

    const inserted = await this.db
      .insert(schema.deals)
      .values({
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        agreedPrice: agreedPrice ?? listing.acquisitionPrice,
        status: 'negotiation',
      })
      .returning();

    await this.db.insert(schema.dealMessages).values({
      dealId: inserted[0].id,
      senderId: listing.sellerId,
      content: 'Deal room opened. You can now negotiate terms, request documents, and draft an LOI.',
    });

    return inserted[0];
  }

  private async getDealOrThrow(dealId: string, userId?: string, role?: string) {
    const rows = await this.db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, dealId))
      .limit(1);
    if (!rows.length) throw new NotFoundException('Deal not found');

    const deal = rows[0];
    if (userId && !this.isParticipant(deal, userId, role)) {
      throw new ForbiddenException('You are not a participant in this deal');
    }
    return deal;
  }

  async getDeal(dealId: string, userId: string, role?: string) {
    const deal = await this.getDealOrThrow(dealId, userId, role);

    const listings = await this.db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, deal.listingId))
      .limit(1);

    const buyer = await this.db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, deal.buyerId))
      .limit(1);
    const seller = await this.db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, deal.sellerId))
      .limit(1);

    return {
      ...deal,
      listing: listings[0] || null,
      buyer: buyer[0] || null,
      seller: seller[0] || null,
    };
  }

  async getUserDeals(userId: string) {
    const rows = await this.db
      .select({
        deal: schema.deals,
        listingTitle: schema.listings.title,
        listingSlug: schema.listings.slug,
      })
      .from(schema.deals)
      .innerJoin(schema.listings, eq(schema.deals.listingId, schema.listings.id))
      .where(or(eq(schema.deals.buyerId, userId), eq(schema.deals.sellerId, userId)))
      .orderBy(desc(schema.deals.updatedAt));

    return rows.map((r) => ({ ...r.deal, listingTitle: r.listingTitle, listingSlug: r.listingSlug }));
  }

  async sendMessage(dealId: string, senderId: string, content: string, role?: string) {
    if (!content?.trim()) throw new BadRequestException('Message content is required');
    const deal = await this.getDealOrThrow(dealId, senderId, role);

    if (deal.status === 'cancelled') {
      throw new BadRequestException('This deal is cancelled');
    }

    const inserted = await this.db
      .insert(schema.dealMessages)
      .values({ dealId, senderId, content: content.trim() })
      .returning();

    await this.db
      .update(schema.deals)
      .set({ updatedAt: new Date() })
      .where(eq(schema.deals.id, dealId));

    // Notify the counterparty (skip for staff observers who aren't buyer/seller)
    const recipientId = senderId === deal.buyerId ? deal.sellerId : deal.buyerId;
    if (recipientId !== senderId) {
      this.notificationsService.notify({
        userId: recipientId,
        type: 'deal',
        title: 'New message in your deal room',
        body: content.trim().slice(0, 140),
        link: `/deal/${dealId}`,
        metadata: { dealId },
      });
    }

    return inserted[0];
  }

  async getMessages(dealId: string, userId: string, role?: string) {
    await this.getDealOrThrow(dealId, userId, role);
    return this.db
      .select()
      .from(schema.dealMessages)
      .where(eq(schema.dealMessages.dealId, dealId))
      .orderBy(asc(schema.dealMessages.createdAt));
  }

  async updateDealStatus(dealId: string, status: DealStatus, userId: string, role?: string) {
    const deal = await this.getDealOrThrow(dealId, userId, role);

    const allowed = DEAL_TRANSITIONS[deal.status as DealStatus] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move deal from '${deal.status}' to '${status}'`);
    }

    const updated = await this.db
      .update(schema.deals)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.deals.id, dealId))
      .returning();

    if (status === 'closed') {
      await this.db
        .update(schema.listings)
        .set({ status: 'sold' })
        .where(eq(schema.listings.id, deal.listingId));
    }

    const counterpartyId = userId === deal.buyerId ? deal.sellerId : deal.buyerId;
    if (counterpartyId !== userId) {
      this.notificationsService.notify({
        userId: counterpartyId,
        type: 'deal',
        title: `Deal moved to ${status.replace(/_/g, ' ')}`,
        link: `/deal/${dealId}`,
        metadata: { dealId, status },
      });
    }

    return updated[0];
  }

  async generateLegalDocument(dealId: string, documentType: string, userId: string, role?: string) {
    const deal = await this.getDealOrThrow(dealId, userId, role);

    const listings = await this.db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, deal.listingId))
      .limit(1);
    const listing = listings[0] || { title: 'Unknown listing' };

    // Load party names
    const buyer = await this.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, deal.buyerId)).limit(1);
    const seller = await this.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, deal.sellerId)).limit(1);
    const buyerName = buyer[0]?.email?.split('@')[0] || '[Buyer]';
    const sellerName = seller[0]?.email?.split('@')[0] || '[Seller]';

    let content: any;

    switch (documentType) {
      case 'nda':
        content = await this.aiService.generateNDA(buyerName, sellerName, listing.title);
        break;
      case 'dd_checklist':
        content = await this.aiService.generateDueDiligenceChecklist(listing, deal);
        break;
      case 'escrow_agreement':
        content = await this.aiService.generateEscrowAgreement(deal, listing, buyerName, sellerName);
        break;
      case 'loi':
      case 'apa':
        content = await this.aiService.generateLegalDocument(deal, listing, documentType as 'loi' | 'apa');
        break;
      default:
        throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }

    // Save to deal_documents for tracking
    const docRecord = await this.db.insert(schema.dealDocuments).values({
      dealId,
      documentType,
      title: content.title || `${documentType.toUpperCase()} — ${listing.title}`,
      content,
      version: 1,
      status: 'draft',
      generatedBy: userId,
    }).returning();

    // Also save to ai_audits for audit trail
    await this.db.insert(schema.aiAudits).values({
      dealId,
      listingId: deal.listingId,
      documentType: documentType as any,
      content,
    });

    return docRecord[0];
  }

  /**
   * List all documents generated for a deal.
   */
  async getDealDocuments(dealId: string, userId: string, role?: string) {
    await this.getDealOrThrow(dealId, userId, role);
    return this.db
      .select()
      .from(schema.dealDocuments)
      .where(eq(schema.dealDocuments.dealId, dealId))
      .orderBy(desc(schema.dealDocuments.createdAt));
  }

  /**
   * Sign a document (buyer or seller).
   */
  async signDocument(dealId: string, documentId: string, userId: string, role?: string) {
    const deal = await this.getDealOrThrow(dealId, userId, role);

    const docs = await this.db
      .select()
      .from(schema.dealDocuments)
      .where(and(eq(schema.dealDocuments.id, documentId), eq(schema.dealDocuments.dealId, dealId)))
      .limit(1);
    if (!docs.length) throw new NotFoundException('Document not found');

    const doc = docs[0];
    const updates: any = { updatedAt: new Date() };

    if (deal.buyerId === userId && !doc.signedByBuyer) {
      updates.signedByBuyer = true;
      updates.buyerSignedAt = new Date();
    } else if (deal.sellerId === userId && !doc.signedBySeller) {
      updates.signedBySeller = true;
      updates.sellerSignedAt = new Date();
    } else {
      throw new BadRequestException('You have already signed this document or are not a party');
    }

    // If both parties have now signed, mark as executed
    const willBeBothSigned =
      (updates.signedByBuyer || doc.signedByBuyer) && (updates.signedBySeller || doc.signedBySeller);
    if (willBeBothSigned) {
      updates.status = 'executed';
    } else {
      updates.status = 'signed';
    }

    const updated = await this.db
      .update(schema.dealDocuments)
      .set(updates)
      .where(eq(schema.dealDocuments.id, documentId))
      .returning();

    return updated[0];
  }
}
