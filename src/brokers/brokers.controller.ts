import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { BrokersService } from './brokers.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('brokers')
export class BrokersController {
  constructor(private readonly brokersService: BrokersService) {}

  @Post('financials/:listingId')
  addFinancialRecord(@Param('listingId') listingId: string, @Body() body: any) {
    return this.brokersService.addFinancialRecord(listingId, body.monthYear, body.revenue, body.expenses, body.rawInput);
  }

  @Post('build-pnl')
  buildPnL(@Body() body: { rawInputText: string }) {
    return this.brokersService.buildPnL(body.rawInputText);
  }

  @Post('valuation/:listingId')
  generateValuation(@Param('listingId') listingId: string) {
    return this.brokersService.generateValuation(listingId);
  }

  @Post('cim/:listingId')
  generateCIM(@Param('listingId') listingId: string) {
    return this.brokersService.generateCIM(listingId);
  }

  @Post('mandates')
  setBuyerMandate(@Request() req: any, @Body() body: any) {
    return this.brokersService.setBuyerMandate(req.user.userId, body.targetCategories, body.minMrr, body.maxBudget, body.preferences);
  }

  @Get('matches/:listingId')
  findMatchingBuyers(@Param('listingId') listingId: string) {
    return this.brokersService.findMatchingBuyers(listingId);
  }

  @Post('contact')
  contactBroker(@Request() req: any, @Body() body: { message?: string }) {
    return this.brokersService.contactBroker(
      req.user.userId, 
      req.user.email || 'user@example.com', 
      body.message || 'I need assistance with M&A strategy.'
    );
  }
}
