import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOfferDto {
  @ApiProperty({ description: 'Listing to make an offer on' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ example: 25000, description: 'Offer amount in major currency units' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Message to the seller' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class UpdateOfferStatusDto {
  @ApiPropertyOptional({ description: 'Optional note attached to the decision' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
