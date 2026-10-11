import { Controller, Post, Get, Body, Param, UseGuards, Request, Patch } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { KycGuard } from '../auth/kyc.guard';

@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  createInvoice(@Body() body: { dealId: string; buyerId: string; amount: number; description: string }) {
    return this.invoicesService.createInvoice(body.dealId, body.buyerId, body.amount, body.description);
  }

  @Get('deal/:dealId')
  getDealInvoices(@Param('dealId') dealId: string) {
    return this.invoicesService.getDealInvoices(dealId);
  }

  @UseGuards(KycGuard)
  @Post(':id/pay')
  processPaymentIntent(@Param('id') id: string) {
    return this.invoicesService.processPaymentIntent(id);
  }

  // Admin / Webhook simulation
  @Patch(':id/mark-paid')
  markAsPaid(@Param('id') id: string) {
    return this.invoicesService.markAsPaid(id);
  }

  @Patch(':id/release')
  releaseFunds(@Param('id') id: string) {
    return this.invoicesService.releaseFunds(id);
  }
}
