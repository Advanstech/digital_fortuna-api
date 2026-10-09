import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, asc, sql, count } from 'drizzle-orm';
import { CacheService } from '../redis/cache.service';
import { ListingFilterDto, ListingStatus, ListingCategory } from '../common/dto/listing.dto';
import { createPaginatedResponse, PaginatedResponse } from '../common/dto/pagination.dto';
import { MailService } from '../mail/mail.service';

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
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    const mockListings = [
      {
        id: "mock-1",
        sellerId: "user-1",
        slug: "modernrx-pos",
        title: "ModernRx POS",
        tagline: "Pharmacy Point of Sale",
        description: "A modern POS for pharmacies.",
        category: "saas",
        acquisitionPrice: 15000,
        monthlyLicensePrice: 500,
        revenueMrr: 1000,
        revenueArr: 12000,
        techStack: ["Next.js", "Fastify", "PostgreSQL"],
        demoUrl: "/images/modernrx.png",
        repoUrl: "https://github.com/mock",
        status: "live",
        featured: true,
        verified: true,
        aiScore: 95,
        createdAt: new Date(),
        publishedAt: new Date(),
      },
      {
        id: "mock-2",
        sellerId: "user-2",
        slug: "fortunaeats-pos",
        title: "FortunaEats POS",
        tagline: "Restaurant Point of Sale",
        description: "A modern POS for restaurants.",
        category: "saas",
        acquisitionPrice: 8500,
        monthlyLicensePrice: 300,
        revenueMrr: 800,
        revenueArr: 9600,
        techStack: ["React Native", "Node.js", "MongoDB"],
        demoUrl: "/images/fortunaeats.png",
        repoUrl: "https://github.com/mock",
        status: "live",
        featured: false,
        verified: true,
        aiScore: 88,
        createdAt: new Date(),
        publishedAt: new Date(),
      }
    ];

    let filtered = mockListings;
    if (filters?.category) {
      filtered = filtered.filter(l => l.category === filters.category);
    }
    if (filters?.status) {
      filtered = filtered.filter(l => l.status === filters.status);
    }
    if (filters?.minPrice !== undefined) {
      filtered = filtered.filter(l => l.acquisitionPrice >= filters.minPrice! || l.monthlyLicensePrice >= filters.minPrice!);
    }
    if (filters?.maxPrice !== undefined) {
      filtered = filtered.filter(l => l.acquisitionPrice <= filters.maxPrice! || l.monthlyLicensePrice <= filters.maxPrice!);
    }

    const total = filtered.length;
    const paginatedListings = filtered.slice(offset, offset + limit);

    return createPaginatedResponse(paginatedListings, total, page, limit);
  }

  async findOne(slug: string) {
    const cacheKey = this.cacheService.generateKey(this.CACHE_PREFIX, 'detail', slug);

    return this.cacheService.getOrSet(
      cacheKey,
      () => this.fetchListing(slug),
      this.CACHE_TTL,
    );
  }

  private async fetchListing(slug: string) {
    const mockListing = {
      id: "mock-1",
      sellerId: "user-1",
      slug: slug,
      title: "ModernRx POS",
      tagline: "Pharmacy Point of Sale",
      description: "A modern POS for pharmacies.",
      category: "saas",
      acquisitionPrice: 15000,
      monthlyLicensePrice: 500,
      revenueMrr: 1000,
      revenueArr: 12000,
      techStack: ["Next.js", "Fastify", "PostgreSQL"],
      demoUrl: "/images/modernrx.png",
      repoUrl: "https://github.com/mock",
      status: "live",
      featured: true,
      verified: true,
      aiScore: 95,
      createdAt: new Date(),
      publishedAt: new Date(),
    };
    
    return mockListing;
  }

  async findById(id: string) {
    const cacheKey = this.cacheService.generateKey(this.CACHE_PREFIX, 'id', id);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return {
          id: id,
          sellerId: "user-1",
          slug: "mock-listing",
          title: "Mocked Listing",
          tagline: "Pharmacy Point of Sale",
          description: "A modern POS for pharmacies.",
          category: "saas",
          acquisitionPrice: 15000,
          monthlyLicensePrice: 500,
          revenueMrr: 1000,
          revenueArr: 12000,
          techStack: ["Next.js", "Fastify", "PostgreSQL"],
          demoUrl: "/images/modernrx.png",
          repoUrl: "https://github.com/mock",
          status: "live",
          featured: true,
          verified: true,
          aiScore: 95,
          createdAt: new Date(),
          publishedAt: new Date(),
        };
      },
      this.CACHE_TTL,
    );
  }

  async createListing(data: any, userId: string) {
    // Mock the creation of a listing
    const newListing = {
      id: "mock-" + Date.now(),
      sellerId: userId,
      slug: (data.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: data.title,
      category: data.category,
      acquisitionPrice: data.acquisitionPrice,
      status: "draft",
      createdAt: new Date(),
    };

    // Send email notification using Resend
    // We would normally look up the user's email based on userId here,
    // but for this mock implementation, we use a placeholder or data.contactEmail if provided.
    const recipientEmail = data.contactEmail || 'founder@example.com';
    await this.mailService.sendListingCreatedEmail(recipientEmail, data.title).catch(err => {
      this.logger.error(`Failed to send listing creation email: ${err.message}`);
    });

    return newListing;
  }

  async invalidateCache(listingId?: string, slug?: string): Promise<void> {
    // Invalidate list cache
    await this.cacheService.deletePattern(`${this.CACHE_PREFIX}:list:*`);
    
    // Invalidate specific listing caches
    if (listingId) {
      await this.cacheService.delete(this.cacheService.generateKey(this.CACHE_PREFIX, 'id', listingId));
    }
    
    if (slug) {
      await this.cacheService.delete(this.cacheService.generateKey(this.CACHE_PREFIX, 'detail', slug));
    }
  }
}
