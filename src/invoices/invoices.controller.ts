import { Controller, Post, Get, Body, Param, UseGuards, Req, Patch } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { KycGuard } from '../auth/kyc.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Invoices')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new invoice for a deal' })
  createInvoice(@Body() body: { dealId: string; buyerId: string; amount: number; description: string }) {
    return this.invoicesService.createInvoice(body.dealId, body.buyerId, body.amount, body.description);
  }

  @Get('deal/:dealId')
  @ApiOperation({ summary: 'Get all invoices for a deal' })
  getDealInvoices(@Param('dealId') dealId: string) {
    return this.invoicesService.getDealInvoices(dealId);
  }

  @UseGuards(KycGuard)
  @Post(':id/pay')
  @ApiOperation({ summary: 'Pay an invoice via GTPay' })
  payInvoice(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: {
      serviceName: string;
      serviceNumber: string;
      secondaryServiceNumber?: string;
      paidBy: string;
    },
  ) {
    return this.invoicesService.payInvoice(id, req.user.sub, body);
  }

  @Patch(':id/mark-paid')
  @ApiOperation({ summary: 'Manually mark invoice as paid (admin/webhook)' })
  markAsPaid(@Param('id') id: string) {
    return this.invoicesService.markAsPaid(id);
  }

  @Patch(':id/release')
  @ApiOperation({ summary: 'Release invoice funds to seller' })
  releaseFunds(@Param('id') id: string) {
    return this.invoicesService.releaseFunds(id);
  }
}
