import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe, Post, Body, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { ListingFilterDto } from '../common/dto/listing.dto';
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
    description: 'Returns paginated listings with optional category, price range, and status filters'
  })
  @ApiQuery({ name: 'category', required: false, enum: ['saas', 'pos', 'mobile', 'blockchain', 'marketing', 'fintech', 'edtech', 'ecommerce', 'other'] })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'review', 'live', 'sold', 'archived'] })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post()
  @ApiOperation({ summary: 'Create a new listing' })
  @ApiResponse({ status: 201, description: 'Listing created' })
  async createListing(@Body() body: any, @Request() req: any) {
    return this.listingsService.createListing(body, req.user.userId);
  }

  @Public()
  @Get('featured')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get featured listings' })
  @ApiResponse({ status: 200, description: 'Returns featured listings' })
  async findFeatured() {
    // Return first page with featured items
    return this.listingsService.findAll({ limit: 6 });
  }

  @Public()
  @Get(':slug')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get listing by slug' })
  @ApiResponse({ status: 200, description: 'Returns listing details' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findOne(@Param('slug') slug: string) {
    return this.listingsService.findOne(slug);
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
}

