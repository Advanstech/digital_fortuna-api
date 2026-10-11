import { IsString, IsEmail, IsEnum, IsNumber, IsOptional, IsBoolean, IsJSON, MinLength, MaxLength, IsUrl, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { listingCategoryEnum, listingStatusEnum } from '../../db/schema';

export enum ListingCategory {
  SAAS = 'saas',
  POS = 'pos',
  MOBILE = 'mobile',
  BLOCKCHAIN = 'blockchain',
  MARKETING = 'marketing',
  FINTECH = 'fintech',
  EDTECH = 'edtech',
  ECOMMERCE = 'ecommerce',
  OTHER = 'other',
}

export enum ListingStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  LIVE = 'live',
  SOLD = 'sold',
  ARCHIVED = 'archived',
}

export class CreateListingDto {
  @ApiPropertyOptional({ example: 'my-awesome-saas', description: 'Unique URL slug (auto-generated from title when omitted)' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  slug?: string;

  @ApiProperty({ example: 'My Awesome SaaS', description: 'Listing title' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'The best SaaS for X', description: 'Short tagline' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  tagline?: string;

  @ApiPropertyOptional({ example: 'Full description...', description: 'Detailed description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ListingCategory, description: 'Business category' })
  @IsEnum(ListingCategory)
  category!: ListingCategory;

  @ApiPropertyOptional({ example: 50000, description: 'Acquisition price in USD' })
  @IsOptional()
  @IsInt()
  acquisitionPrice?: number;

  @ApiPropertyOptional({ example: 99, description: 'Monthly license price in USD' })
  @IsOptional()
  @IsInt()
  monthlyLicensePrice?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Monthly recurring revenue' })
  @IsOptional()
  @IsInt()
  revenueMrr?: number;

  @ApiPropertyOptional({ example: 120000, description: 'Annual recurring revenue' })
  @IsOptional()
  @IsInt()
  revenueArr?: number;

  @ApiPropertyOptional({ description: 'Tech stack as JSON object' })
  @IsOptional()
  techStack?: Record<string, any>;

  @ApiPropertyOptional({ example: 'https://demo.example.com' })
  @IsOptional()
  @IsUrl()
  demoUrl?: string;

  @ApiPropertyOptional({ example: 'https://github.com/user/repo' })
  @IsOptional()
  @IsUrl()
  repoUrl?: string;

  @ApiPropertyOptional({ description: 'Rich sales collateral: highlights, metrics, benefits, relevance, growth, images' })
  @IsOptional()
  details?: Record<string, any>;

  @ApiPropertyOptional({ example: 'owner@example.com', description: 'Contact email for listing notifications' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class UpdateListingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  acquisitionPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  monthlyLicensePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  revenueMrr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  revenueArr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  techStack?: any;

  @ApiPropertyOptional()
  @IsOptional()
  demoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  repoUrl?: string;

  @ApiPropertyOptional({ description: 'Rich sales collateral update' })
  @IsOptional()
  details?: Record<string, any>;
}

export class ListingFilterDto {
  @ApiPropertyOptional({ description: 'Category filter or search keyword' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ description: 'Minimum price' })
  @IsOptional()
  @IsInt()
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price' })
  @IsOptional()
  @IsInt()
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum monthly recurring revenue' })
  @IsOptional()
  @IsInt()
  minMrr?: number;

  @ApiPropertyOptional({ description: 'Full-text search over title, tagline and description' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['newest', 'price-asc', 'price-desc', 'mrr-desc'] })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Only featured listings' })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ description: 'Filter by seller user id' })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
