import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe, Post, Body, Request, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { ListingFilterDto, CreateListingDto, UpdateListingDto } from '../common/dto/listing.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Public()
  @Get()
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get all listings with filtering and pagination',
    description: 'Returns paginated live listings with optional category, price range, MRR, search, and sort filters'
  })
  @ApiQuery({ name: 'category', required: false, enum: ['saas', 'pos', 'mobile', 'blockchain', 'marketing', 'fintech', 'edtech', 'ecommerce', 'other'] })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'review', 'live', 'sold', 'archived'] })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'minMrr', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'price-asc', 'price-desc', 'mrr-desc'] })
  @ApiQuery({ name: 'featured', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated listings',
    schema: {
      example: {
        data: [],
        meta: { page: 1, limit: 20, total: 100, totalPages: 5 }
      }
    }
  })
  async findAll(@Query() filters: ListingFilterDto) {
    return this.listingsService.findAll(filters);
  }

  @Public()
  @Get('featured')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get featured listings' })
  @ApiResponse({ status: 200, description: 'Returns featured listings' })
  async findFeatured() {
    return this.listingsService.findAll({ featured: true, limit: 6 });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('mine')
  @ApiOperation({ summary: 'Get listings owned by the current user' })
  @ApiResponse({ status: 200, description: 'Returns user listings' })
  async myListings(@Request() req: any) {
    return this.listingsService.myListings(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post()
  @ApiOperation({ summary: 'Create a new listing' })
  @ApiResponse({ status: 201, description: 'Listing created' })
  async createListing(@Body() body: CreateListingDto & { contactEmail?: string }, @Request() req: any) {
    return this.listingsService.createListing(body, req.user.userId);
  }

  @Public()
  @Get(':slug')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get listing by slug' })
  @ApiResponse({ status: 200, description: 'Returns listing details' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findOne(@Param('slug') slug: string, @Request() req: any) {
    return this.listingsService.findOne(slug, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('by-id/:id')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get listing by ID (authenticated)' })
  @ApiResponse({ status: 200, description: 'Returns listing details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a listing (owner or admin)' })
  @ApiResponse({ status: 200, description: 'Listing updated' })
  @ApiResponse({ status: 403, description: 'Not the listing owner' })
  async updateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateListingDto,
    @Request() req: any,
  ) {
    return this.listingsService.updateListing(id, body, req.user.userId, req.user.role);
  }
}
