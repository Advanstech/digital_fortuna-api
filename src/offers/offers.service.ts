import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, or, inArray } from 'drizzle-orm';
import { CreateOfferDto } from '../common/dto/offer.dto';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private mailService: MailService,
    private notificationsService: NotificationsService,
  ) {}

  private async getListingOrThrow(listingId: string) {
    const rows = await this.db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, listingId))
      .limit(1);
    if (!rows.length) throw new NotFoundException('Listing not found');
    return rows[0];
  }

  private async getOfferOrThrow(offerId: string) {
    const rows = await this.db
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.id, offerId))
      .limit(1);
    if (!rows.length) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  async createOffer(dto: CreateOfferDto, buyerId: string) {
    const listing = await this.getListingOrThrow(dto.listingId);

    if (listing.status !== 'live') {
      throw new BadRequestException('This listing is not open to offers');
    }
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('You cannot make an offer on your own listing');
    }

    const existing = await this.db
      .select({ id: schema.offers.id })
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.listingId, dto.listingId),
          eq(schema.offers.buyerId, buyerId),
          eq(schema.offers.status, 'pending'),
        ),
      )
      .limit(1);

    if (existing.length) {
      throw new BadRequestException('You already have a pending offer on this listing');
    }

    const inserted = await this.db
      .insert(schema.offers)
      .values({
        listingId: dto.listingId,
        buyerId,
        amount: dto.amount,
        currency: (dto.currency || 'USD').toUpperCase(),
        message: dto.message,
        status: 'pending',
      })
      .returning();

    const offer = inserted[0];

    this.notificationsService.notify({
      userId: listing.sellerId,
      type: 'offer',
      title: `New offer on ${listing.title}`,
      body: `${offer.currency} ${offer.amount.toLocaleString()}${offer.message ? ` — "${offer.message.slice(0, 120)}"` : ''}`,
      link: '/dashboard',
      metadata: { offerId: offer.id, listingId: listing.id, amount: offer.amount, currency: offer.currency },
    });

    const seller = await this.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, listing.sellerId))
      .limit(1);

    if (seller.length) {
      this.mailService
        .sendEmail(
          seller[0].email,
          `New offer on ${listing.title}`,
          `<div style="font-family: sans-serif; max-width: 600px;">
            <h2>New Offer Received</h2>
            <p>You received an offer of <strong>${escapeHtml(offer.currency)} ${offer.amount.toLocaleString()}</strong> on <strong>${escapeHtml(listing.title)}</strong>.</p>
            ${offer.message ? `<blockquote style="border-left: 4px solid #00FF85; padding-left: 10px; color: #555;">${escapeHtml(offer.message)}</blockquote>` : ''}
            <p>Log in to your dashboard to accept or reject it.</p>
          </div>`,
        )
        .catch((err) => this.logger.warn(`Offer notification email failed: ${err.message}`));
    }

    return offer;
  }

  async getMyOffers(buyerId: string) {
    const rows = await this.db
      .select({
        offer: schema.offers,
        listingTitle: schema.listings.title,
        listingSlug: schema.listings.slug,
      })
      .from(schema.offers)
      .innerJoin(schema.listings, eq(schema.offers.listingId, schema.listings.id))
      .where(eq(schema.offers.buyerId, buyerId))
      .orderBy(desc(schema.offers.createdAt));

    return rows.map((r) => ({ ...r.offer, listingTitle: r.listingTitle, listingSlug: r.listingSlug }));
  }

  async getReceivedOffers(sellerId: string) {
    const rows = await this.db
      .select({
        offer: schema.offers,
        listingTitle: schema.listings.title,
        listingSlug: schema.listings.slug,
      })
      .from(schema.offers)
      .innerJoin(schema.listings, eq(schema.offers.listingId, schema.listings.id))
      .where(eq(schema.listings.sellerId, sellerId))
      .orderBy(desc(schema.offers.createdAt));

    return rows.map((r) => ({ ...r.offer, listingTitle: r.listingTitle, listingSlug: r.listingSlug }));
  }

  async getListingOffers(listingId: string, requesterId: string) {
    const listing = await this.getListingOrThrow(listingId);

    const conditions =
      listing.sellerId === requesterId
        ? eq(schema.offers.listingId, listingId)
        : and(eq(schema.offers.listingId, listingId), eq(schema.offers.buyerId, requesterId));

    return this.db
      .select()
      .from(schema.offers)
      .where(conditions)
      .orderBy(desc(schema.offers.createdAt));
  }

  private async transition(offerId: string, userId: string, actor: 'buyer' | 'seller', to: OfferStatus) {
    const offer = await this.getOfferOrThrow(offerId);
    const listing = await this.getListingOrThrow(offer.listingId);

    if (actor === 'seller' && listing.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can do this');
    }
    if (actor === 'buyer' && offer.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can do this');
    }
    if (offer.status !== 'pending') {
      throw new BadRequestException(`Offer is already ${offer.status}`);
    }

    const updated = await this.db
      .update(schema.offers)
      .set({ status: to })
      .where(eq(schema.offers.id, offerId))
      .returning();

    return { offer: updated[0], listing };
  }

  async acceptOffer(offerId: string, sellerId: string) {
    const { offer, listing } = await this.transition(offerId, sellerId, 'seller', 'accepted');

    // Reject all other pending offers on this listing
    await this.db
      .update(schema.offers)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(schema.offers.listingId, listing.id),
          eq(schema.offers.status, 'pending'),
        ),
      );

    // Create the deal room for buyer + seller
    const deal = await this.db
      .insert(schema.deals)
      .values({
        listingId: listing.id,
        buyerId: offer.buyerId,
        sellerId: listing.sellerId,
        agreedPrice: offer.amount,
        status: 'negotiation',
      })
      .returning();

    // Notify the buyer
    this.notificationsService.notify({
      userId: offer.buyerId,
      type: 'offer',
      title: `Your offer on ${listing.title} was accepted`,
      body: `A secure deal room has been opened. Negotiate terms, sign an LOI, and fund escrow.`,
      link: `/deal/${deal[0].id}`,
      metadata: { offerId: offer.id, listingId: listing.id, dealId: deal[0].id },
    });

    const buyer = await this.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, offer.buyerId))
      .limit(1);

    if (buyer.length) {
      this.mailService
        .sendEmail(
          buyer[0].email,
          `Your offer on ${listing.title} was accepted`,
          `<div style="font-family: sans-serif; max-width: 600px;">
            <h2>Offer Accepted</h2>
            <p>Your offer of <strong>${escapeHtml(offer.currency)} ${offer.amount.toLocaleString()}</strong> on <strong>${escapeHtml(listing.title)}</strong> was accepted.</p>
            <p>A secure deal room has been opened so you can negotiate terms, sign an LOI, and fund escrow.</p>
          </div>`,
        )
        .catch((err) => this.logger.warn(`Offer acceptance email failed: ${err.message}`));
    }

    return { offer: { ...offer, status: 'accepted' }, deal: deal[0] };
  }

  async rejectOffer(offerId: string, sellerId: string) {
    const { offer, listing } = await this.transition(offerId, sellerId, 'seller', 'rejected');

    this.notificationsService.notify({
      userId: offer.buyerId,
      type: 'offer',
      title: `Your offer on ${listing.title} was declined`,
      body: `Your offer of ${offer.currency} ${offer.amount.toLocaleString()} was declined by the seller.`,
      link: '/dashboard',
      metadata: { offerId: offer.id, listingId: listing.id },
    });

    return offer;
  }

  async withdrawOffer(offerId: string, buyerId: string) {
    const { offer } = await this.transition(offerId, buyerId, 'buyer', 'withdrawn');
    return offer;
  }
}
