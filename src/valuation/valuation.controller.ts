import { Controller, Post, Get, Body, Param, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ValuationService, ValuationInput } from './valuation.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { IsOptional, IsString, IsNumber, IsInt, Min } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';

class QuickValuationDto {
  @IsOptional() @IsInt() revenueMrr?: number;
  @IsOptional() @IsInt() revenueArr?: number;
  @IsOptional() @IsInt() totalRevenue?: number;
  @IsOptional() @IsInt() totalExpenses?: number;
  @IsOptional() @IsInt() ownerSalary?: number;
  @IsOptional() @IsNumber() revenueGrowthPct?: number;
  @IsOptional() @IsNumber() monthlyChurnPct?: number;
  @IsString() category!: string;
  @IsOptional() @IsNumber() profitMarginPct?: number;
}

@ApiTags('Valuation')
@Controller('valuation')
export class ValuationController {
  constructor(private readonly valuationService: ValuationService) {}

  @Public()
  @Post('quick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quick inline valuation — no auth required, no DB save' })
  @ApiResponse({ status: 200, description: 'Returns valuation report' })
  quickValuation(@Body() body: QuickValuationDto) {
    return this.valuationService.computeQuickValuation(body as ValuationInput);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('listing/:id')
  @ApiOperation({ summary: 'Run full valuation on a listing (saves report, updates AI score)' })
  @ApiResponse({ status: 201, description: 'Valuation report created' })
  valuateListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.valuationService.valuateListing(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('listing/:id/narrative')
  @ApiOperation({ summary: 'AI-enriched valuation with professional narrative' })
  @ApiResponse({ status: 201, description: 'Valuation report with AI narrative' })
  valuateWithNarrative(@Param('id', ParseUUIDPipe) id: string) {
    return this.valuationService.valuateWithAiNarrative(id);
  }
}
