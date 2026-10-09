import { Controller, Post, Get, Body, Param, UseGuards, Request, Patch } from '@nestjs/common';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  createDeal(@Request() req: any, @Body() body: { listingId: string; agreedPrice: number }) {
    return this.dealsService.createDeal(body.listingId, req.user.userId, body.agreedPrice);
  }

  @Get('my-deals')
  getUserDeals(@Request() req: any) {
    return this.dealsService.getUserDeals(req.user.userId);
  }

  @Get(':id')
  getDeal(@Param('id') id: string) {
    return this.dealsService.getDeal(id);
  }

  @Post(':id/messages')
  sendMessage(@Param('id') id: string, @Request() req: any, @Body() body: { content: string }) {
    return this.dealsService.sendMessage(id, req.user.userId, body.content);
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string) {
    return this.dealsService.getMessages(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.dealsService.updateDealStatus(id, body.status);
  }

  @Post(':id/generate-document')
  generateLegalDocument(@Param('id') id: string, @Body() body: { documentType: 'loi' | 'apa' }) {
    return this.dealsService.generateLegalDocument(id, body.documentType);
  }
}
