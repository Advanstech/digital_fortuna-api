import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, sql, count, gte, lte, or } from 'drizzle-orm';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
  ) {}

  /**
   * Platform overview metrics — real data from the database.
   */
  async getPlatformMetrics() {
    const [
      totalUsers,
      totalListings,
      liveListings,
      totalDeals,
      activeDeals,
      closedDeals,
      totalOffers,
      pendingKyc,
    ] = await Promise.all([
      this.db.$count(schema.users),
      this.db.$count(schema.listings),
      this.db.$count(schema.listings, eq(schema.listings.status, 'live')),
      this.db.$count(schema.deals),
      this.db.$count(schema.deals, and(
        sql`${schema.deals.status} NOT IN ('closed', 'cancelled')`,
      )),
      this.db.$count(schema.deals, eq(schema.deals.status, 'closed')),
      this.db.$count(schema.offers),
      this.db.$count(schema.users, eq(schema.users.kycStatus, 'pending')),
    ]);

    // GMV from closed deals
    const gmvResult = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${schema.deals.agreedPrice}), 0)` })
      .from(schema.deals)
      .where(eq(schema.deals.status, 'closed'));
    const gmv = gmvResult[0]?.total || 0;

    // Escrow balance (paid but not released invoices)
    const escrowResult = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)` })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, 'paid'));
    const escrowBalance = escrowResult[0]?.total || 0;

    // Revenue (platform fees from released invoices — 8% of amount)
    const revenueResult = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)` })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, 'released'));
    const platformRevenue = Math.round((revenueResult[0]?.total || 0) * 0.08);

    // GTPay transaction stats
    let totalGtpayPayments = 0;
    let completedGtpayPayments = 0;
    let gtpayVolume = 0;
    let totalFeesCollected = 0;
    try {
      totalGtpayPayments = await this.db.$count(schema.gtpayPayments);
      completedGtpayPayments = await this.db.$count(schema.gtpayPayments, eq(schema.gtpayPayments.status, 'completed'));
      const volResult = await this.db
        .select({ total: sql<number>`COALESCE(SUM(${schema.gtpayPayments.amount}), 0)` })
        .from(schema.gtpayPayments)
        .where(eq(schema.gtpayPayments.status, 'completed'));
      gtpayVolume = volResult[0]?.total || 0;

      const feeResult = await this.db
        .select({ total: sql<number>`COALESCE(SUM(${schema.marketplaceFees.amount}), 0)` })
        .from(schema.marketplaceFees)
        .where(eq(schema.marketplaceFees.status, 'paid'));
      totalFeesCollected = feeResult[0]?.total || 0;
    } catch {
      // Tables may not exist yet
    }

    // Listings by status
    const listingsByStatus = await this.db
      .select({
        status: schema.listings.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.listings)
      .groupBy(schema.listings.status);

    // Listings by category
    const listingsByCategory = await this.db
      .select({
        category: schema.listings.category,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.listings)
      .groupBy(schema.listings.category);

    // User role distribution
    const usersByRole = await this.db
      .select({
        role: schema.users.role,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.users)
      .groupBy(schema.users.role);

    // Recent deals
    const recentDeals = await this.db
      .select({
        deal: schema.deals,
        listingTitle: schema.listings.title,
      })
      .from(schema.deals)
      .innerJoin(schema.listings, eq(schema.deals.listingId, schema.listings.id))
      .orderBy(desc(schema.deals.createdAt))
      .limit(10);

    return {
      summary: {
        totalUsers: totalUsers || 0,
        totalListings: totalListings || 0,
        liveListings: liveListings || 0,
        totalDeals: totalDeals || 0,
        activeDeals: activeDeals || 0,
        closedDeals: closedDeals || 0,
        totalOffers: totalOffers || 0,
        pendingKyc: pendingKyc || 0,
        gmv: gmv || 0,
        escrowBalance: escrowBalance || 0,
        platformRevenue: platformRevenue || 0,
        totalGtpayPayments,
        completedGtpayPayments,
        gtpayVolume,
        totalFeesCollected,
      },
      listingsByStatus,
      listingsByCategory,
      usersByRole,
      recentDeals: recentDeals.map(r => ({
        ...r.deal,
        listingTitle: r.listingTitle,
      })),
    };
  }

  /**
   * Listings pending moderation (status = 'review').
   */
  async getPendingListings() {
    return this.db
      .select({
        listing: schema.listings,
        sellerEmail: schema.users.email,
      })
      .from(schema.listings)
      .innerJoin(schema.users, eq(schema.listings.sellerId, schema.users.id))
      .where(eq(schema.listings.status, 'review'))
      .orderBy(desc(schema.listings.createdAt));
  }

  /**
   * All deals with enriched data for admin oversight.
   */
  async getAllDeals() {
    const rows = await this.db
      .select({
        deal: schema.deals,
        listingTitle: schema.listings.title,
        buyerEmail: sql<string>`buyer.email`,
        sellerEmail: sql<string>`seller.email`,
      })
      .from(schema.deals)
      .innerJoin(schema.listings, eq(schema.deals.listingId, schema.listings.id))
      .innerJoin(sql`${schema.users} AS buyer`, sql`buyer.id = ${schema.deals.buyerId}`)
      .innerJoin(sql`${schema.users} AS seller`, sql`seller.id = ${schema.deals.sellerId}`)
      .orderBy(desc(schema.deals.updatedAt))
      .limit(50);

    return rows;
  }

  /**
   * All GTPay transactions — admin overview.
   */
  async getAllPayments() {
    return this.db
      .select({
        payment: schema.gtpayPayments,
        userEmail: schema.users.email,
      })
      .from(schema.gtpayPayments)
      .innerJoin(schema.users, eq(schema.gtpayPayments.userId, schema.users.id))
      .orderBy(desc(schema.gtpayPayments.createdAt))
      .limit(200);
  }

  /**
   * All marketplace fees — admin overview.
   */
  async getAllFees() {
    return this.db
      .select({
        fee: schema.marketplaceFees,
        userEmail: schema.users.email,
      })
      .from(schema.marketplaceFees)
      .innerJoin(schema.users, eq(schema.marketplaceFees.userId, schema.users.id))
      .orderBy(desc(schema.marketplaceFees.createdAt))
      .limit(200);
  }

  /**
   * Escrow ledger — all entries across all deals.
   */
  async getAllEscrowEntries() {
    return this.db
      .select()
      .from(schema.escrowLedger)
      .orderBy(desc(schema.escrowLedger.createdAt))
      .limit(200);
  }

  /**
   * Track a platform event for analytics.
   */
  async trackEvent(eventType: string, actorId?: string, entityType?: string, entityId?: string, metadata?: any) {
    await this.db.insert(schema.platformEvents).values({
      eventType,
      actorId,
      entityType,
      entityId,
      metadata,
    }).catch(err => {
      this.logger.warn(`Failed to track event: ${err.message}`);
    });
  }
}
