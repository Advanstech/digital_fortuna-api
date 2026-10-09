import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean, IsJSON, MinLength, MaxLength, IsUrl, IsInt } from 'class-validator';
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
  @ApiProperty({ example: 'my-awesome-saas', description: 'Unique URL slug' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  slug!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  acquisitionPrice?: number;
}

export class ListingFilterDto {
  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

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

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsInt()
  limit?: number = 20;
}
