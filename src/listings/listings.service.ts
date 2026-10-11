import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, asc, sql, gte, lte, or, ilike, SQL } from 'drizzle-orm';
import { CacheService } from '../redis/cache.service';
import { ListingFilterDto, ListingStatus, CreateListingDto, UpdateListingDto } from '../common/dto/listing.dto';
import { createPaginatedResponse, PaginatedResponse } from '../common/dto/pagination.dto';
import { MailService } from '../mail/mail.service';

const VALID_CATEGORIES = ['saas', 'pos', 'mobile', 'blockchain', 'marketing', 'fintech', 'edtech', 'ecommerce', 'other'] as const;

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'listings';

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    @Inject(CacheService) private cacheService: CacheService,
    private mailService: MailService,
  ) {}

  async findAll(filters?: ListingFilterDto): Promise<PaginatedResponse<any>> {
    const cacheKey = this.cacheService.generateKey(
      this.CACHE_PREFIX,
      'list',
      JSON.stringify(filters || {}),
    );

    return this.cacheService.getOrSet(
      cacheKey,
      () => this.fetchListings(filters),
      this.CACHE_TTL,
    );
  }

  private async fetchListings(filters?: ListingFilterDto): Promise<PaginatedResponse<any>> {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Public queries only see live listings — status filter is ignored on the public route.
    // Admin/staff listing moderation should use a separate endpoint.
    conditions.push(eq(schema.listings.status, 'live'));

    if (filters?.category) {
      if ((VALID_CATEGORIES as readonly string[]).includes(filters.category)) {
        conditions.push(eq(schema.listings.category, filters.category as any));
      } else {
        const catTerm = `%${filters.category}%`;
        conditions.push(
          or(
            ilike(schema.listings.title, catTerm),
            ilike(schema.listings.tagline, catTerm),
            ilike(schema.listings.description, catTerm),
          )!,
        );
      }
    }
    if (filters?.featured) {
      conditions.push(eq(schema.listings.featured, true));
    }
    if (filters?.sellerId) {
      conditions.push(eq(schema.listings.sellerId, filters.sellerId));
    }
    if (filters?.minPrice !== undefined) {
      conditions.push(
        or(
          gte(schema.listings.acquisitionPrice, filters.minPrice),
          gte(schema.listings.monthlyLicensePrice, filters.minPrice),
        )!,
      );
    }
    if (filters?.maxPrice !== undefined) {
      conditions.push(
        or(
          lte(schema.listings.acquisitionPrice, filters.maxPrice),
          lte(schema.listings.monthlyLicensePrice, filters.maxPrice),
        )!,
      );
    }
    if (filters?.minMrr !== undefined) {
      conditions.push(gte(schema.listings.revenueMrr, filters.minMrr));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(schema.listings.title, term),
          ilike(schema.listings.tagline, term),
          ilike(schema.listings.description, term),
        )!,
      );
    }

    const where = and(...conditions);

    const orderBy =
      filters?.sort === 'price-asc'
        ? asc(schema.listings.acquisitionPrice)
        : filters?.sort === 'price-desc'
          ? desc(schema.listings.acquisitionPrice)
          : filters?.sort === 'mrr-desc'
            ? desc(schema.listings.revenueMrr)
            : desc(schema.listings.createdAt);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.listings)
        .where(where)
        .orderBy(desc(schema.listings.featured), orderBy)
        .limit(limit)
        .offset(offset),
      this.db.$count(schema.listings, where),
    ]);

    return createPaginatedResponse(rows, totalRows || 0, page, limit);
  }

  async findOne(slug: string, requesterId?: string) {
    const cacheKey = this.cacheService.generateKey(this.CACHE_PREFIX, 'detail', slug);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    const listing = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const query = isUuid
          ? or(eq(schema.listings.slug, slug), eq(schema.listings.id, slug))!
          : eq(schema.listings.slug, slug);

        const rows = await this.db
          .select()
          .from(schema.listings)
          .where(query)
          .limit(1);
        return rows[0] || null;
      },
      this.CACHE_TTL,
    );

    if (!listing) throw new NotFoundException('Listing not found');

    // Non-live listings are only visible to their owner and admins
    if (listing.status !== 'live' && listing.sellerId !== requesterId) {
      throw new NotFoundException('Listing not found');
    }

    const media = await this.db
      .select()
      .from(schema.listingMedia)
      .where(eq(schema.listingMedia.listingId, listing.id))
      .orderBy(asc(schema.listingMedia.position));

    return { ...listing, media };
  }

  async findById(id: string) {
    const cacheKey = this.cacheService.generateKey(this.CACHE_PREFIX, 'id', id);

    const listing = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db
          .select()
          .from(schema.listings)
          .where(eq(schema.listings.id, id))
          .limit(1);
        return rows[0] || null;
      },
      this.CACHE_TTL,
    );

    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async myListings(userId: string) {
    return this.db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.sellerId, userId))
      .orderBy(desc(schema.listings.createdAt));
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = this.slugify(title) || 'listing';
    let candidate = base;
    for (let i = 1; i < 20; i++) {
      const existing = await this.db
        .select({ id: schema.listings.id })
        .from(schema.listings)
        .where(eq(schema.listings.slug, candidate))
        .limit(1);
      if (!existing.length) return candidate;
      candidate = `${base}-${i + 1}`;
    }
    return `${base}-${Date.now()}`;
  }

  private normalizeCategory(category?: string): (typeof VALID_CATEGORIES)[number] {
    if (category && (VALID_CATEGORIES as readonly string[]).includes(category)) {
      return category as (typeof VALID_CATEGORIES)[number];
    }
    return 'other';
  }

  async createListing(data: CreateListingDto, userId: string) {
    const slug = data.slug ? await this.uniqueSlug(data.slug) : await this.uniqueSlug(data.title);

    let techStack: any = data.techStack;
    if (typeof techStack === 'string') {
      techStack = techStack.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    const inserted = await this.db
      .insert(schema.listings)
      .values({
        sellerId: userId,
        slug,
        title: data.title,
        tagline: data.tagline,
        description: data.description,
        category: this.normalizeCategory(data.category as string),
        acquisitionPrice: data.acquisitionPrice,
        monthlyLicensePrice: data.monthlyLicensePrice,
        revenueMrr: data.revenueMrr,
        revenueArr: data.revenueArr,
        techStack,
        demoUrl: data.demoUrl,
        repoUrl: data.repoUrl,
        details: data.details,
        status: 'review',
      })
      .returning();

    await this.invalidateCache();

    const recipientEmail = data.contactEmail;
    if (recipientEmail) {
      await this.mailService.sendListingCreatedEmail(recipientEmail, data.title).catch((err) => {
        this.logger.error(`Failed to send listing creation email: ${err.message}`);
      });
    }

    return inserted[0];
  }

  async updateListing(id: string, data: UpdateListingDto, userId: string, role?: string) {
    const listing = await this.findById(id);

    if (listing.sellerId !== userId && role !== 'admin' && role !== 'super_admin') {
      throw new ForbiddenException('You do not own this listing');
    }

    const updates: Record<string, any> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.tagline !== undefined) updates.tagline = data.tagline;
    if (data.description !== undefined) updates.description = data.description;
    if (data.acquisitionPrice !== undefined) updates.acquisitionPrice = data.acquisitionPrice;
    if (data.monthlyLicensePrice !== undefined) updates.monthlyLicensePrice = data.monthlyLicensePrice;
    if (data.revenueMrr !== undefined) updates.revenueMrr = data.revenueMrr;
    if (data.revenueArr !== undefined) updates.revenueArr = data.revenueArr;
    if (data.category !== undefined) updates.category = this.normalizeCategory(data.category as string);
    if (data.techStack !== undefined) {
      updates.techStack = typeof data.techStack === 'string'
        ? data.techStack.split(',').map((s: string) => s.trim()).filter(Boolean)
        : data.techStack;
    }
    if (data.demoUrl !== undefined) updates.demoUrl = data.demoUrl;
    if (data.repoUrl !== undefined) updates.repoUrl = data.repoUrl;
    if (data.details !== undefined) {
      updates.details = { ...((listing.details as Record<string, any>) || {}), ...data.details };
    }

    if (data.status !== undefined) {
      if (role !== 'admin' && role !== 'super_admin') {
        this.assertValidListingTransition(listing.status, data.status);
      }
      updates.status = data.status;
      if (data.status === 'live' && !listing.publishedAt) {
        updates.publishedAt = new Date();
      }
    }

    if (!Object.keys(updates).length) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.db
      .update(schema.listings)
      .set(updates)
      .where(eq(schema.listings.id, id))
      .returning();

    await this.invalidateCache(id, listing.slug);
    return updated[0];
  }

  async deleteListing(id: string, userId: string, role?: string) {
    const listing = await this.findById(id);

    if (listing.sellerId !== userId && role !== 'admin' && role !== 'super_admin') {
      throw new ForbiddenException('You do not own this listing');
    }

    await this.db.delete(schema.listings).where(eq(schema.listings.id, id));
    await this.invalidateCache(id, listing.slug);
    return { success: true, id };
  }

  private assertValidListingTransition(from: string, to: string) {
    // Sellers can only make safe transitions. `review → live` and `* → sold`
    // require admin/staff (handled by the caller checking role first).
    const allowed: Record<string, string[]> = {
      draft: ['review', 'archived'],
      review: ['draft', 'archived'],  // live requires admin
      live: ['archived'],              // sold requires admin
      sold: ['archived'],
      archived: ['draft'],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Cannot move listing from '${from}' to '${to}'`);
    }
  }

  async invalidateCache(listingId?: string, slug?: string): Promise<void> {
    await this.cacheService.deletePattern(`${this.CACHE_PREFIX}:list:*`);

    if (listingId) {
      await this.cacheService.delete(this.cacheService.generateKey(this.CACHE_PREFIX, 'id', listingId));
    }

    if (slug) {
      await this.cacheService.delete(this.cacheService.generateKey(this.CACHE_PREFIX, 'detail', slug));
    }
  }
}
