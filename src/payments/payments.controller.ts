import { Controller, Post, Get, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GtpayService } from './gtpay.service';
import { EscrowService } from './escrow.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { KycGuard } from '../auth/kyc.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly gtpayService: GtpayService,
    private readonly escrowService: EscrowService,
  ) {}

  // ── GTPay Services ──────────────────────────────────────────────────────

  @Get('gtpay/services')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List available GTPay services (creditwallet, debitwallet, banktrf)' })
  async getGtpayServices() {
    return this.gtpayService.getServices();
  }

  @Get('gtpay/banks')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List supported banks for bank transfers' })
  async getGtpayBanks() {
    return this.gtpayService.getBanks();
  }

  @Post('gtpay/query')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify account details / check balance' })
  async queryGtpay(@Body() body: {
    serviceName: string;
    serviceNumber?: string;
    secondaryServiceNumber?: string;
  }) {
    return this.gtpayService.query(body.serviceName, body.serviceNumber, body.secondaryServiceNumber);
  }

  @Post('gtpay/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check GTPay payment status' })
  async getGtpayStatus(@Body() body: { partnerTransId: string }) {
    return this.gtpayService.getStatus(body.partnerTransId);
  }

  @Post('gtpay/callback')
  @ApiOperation({ summary: 'GTBank async callback (no auth — called by GTBank)' })
  async handleGtpayCallback(@Body() callbackData: any) {
    const result = await this.gtpayService.handleCallback(callbackData);

    // If payment completed, trigger side effects (escrow, fees, etc.)
    if (callbackData.Status === 'COMPLETED' && result.partnerTransId) {
      const payment = await this.gtpayService.getPaymentByTransId(result.partnerTransId);
      if (payment) {
        await this.escrowService.onPaymentCompleted(payment.id);
      }
    }

    return result;
  }

  // ── Direct Payment (general purpose) ────────────────────────────────────

  @Post('gtpay/pay')
  @UseGuards(JwtAuthGuard, KycGuard)
  @ApiOperation({ summary: 'Initiate a GTPay payment' })
  async initiateGtpayPayment(
    @Req() req: any,
    @Body() body: {
      serviceName: string;
      serviceNumber: string;
      secondaryServiceNumber?: string;
      amount: number;
      paidBy: string;
      payeeName?: string;
      remarks: string;
      purpose?: string;
      dealId?: string;
      listingId?: string;
    },
  ) {
    return this.gtpayService.initiatePayment({
      userId: req.user.sub,
      purpose: (body.purpose as any) || 'other',
      serviceName: body.serviceName,
      serviceNumber: body.serviceNumber,
      secondaryServiceNumber: body.secondaryServiceNumber,
      amount: body.amount,
      paidBy: body.paidBy,
      payeeName: body.payeeName,
      remarks: body.remarks,
      dealId: body.dealId,
      listingId: body.listingId,
    });
  }

  // ── User Payment History ────────────────────────────────────────────────

  @Get('my-payments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user payment history' })
  async getMyPayments(@Req() req: any) {
    return this.gtpayService.getUserPayments(req.user.sub);
  }

  @Get('my-fees')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user marketplace fees' })
  async getMyFees(@Req() req: any) {
    return this.escrowService.getUserFees(req.user.sub);
  }

  // ── Escrow ──────────────────────────────────────────────────────────────

  @Post('escrow/deposit')
  @UseGuards(JwtAuthGuard, KycGuard)
  @ApiOperation({ summary: 'Deposit funds into escrow for a deal' })
  async depositToEscrow(
    @Req() req: any,
    @Body() body: {
      dealId: string;
      serviceName: string;
      serviceNumber: string;
      secondaryServiceNumber?: string;
      amount: number;
      paidBy: string;
    },
  ) {
    return this.escrowService.depositToEscrow({
      ...body,
      userId: req.user.sub,
    });
  }

  @Get('escrow/:dealId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get escrow balance and ledger for a deal' })
  async getEscrowInfo(@Param('dealId') dealId: string) {
    const [balance, ledger, payments] = await Promise.all([
      this.escrowService.getEscrowBalance(dealId),
      this.escrowService.getEscrowLedger(dealId),
      this.gtpayService.getDealPayments(dealId),
    ]);
    return {
      dealId,
      balance: balance / 100, // convert pesewas to GHS
      currency: 'GHS',
      ledger,
      payments,
    };
  }

  @Post('escrow/release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'superadmin')
  @ApiOperation({ summary: 'Release escrow funds to seller (admin only)' })
  async releaseEscrow(
    @Req() req: any,
    @Body() body: {
      dealId: string;
      sellerServiceName: string;
      sellerServiceNumber: string;
      sellerSecondaryServiceNumber?: string;
      sellerName: string;
    },
  ) {
    return this.escrowService.releaseEscrow({
      ...body,
      adminUserId: req.user.sub,
    });
  }

  @Post('escrow/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'superadmin')
  @ApiOperation({ summary: 'Refund escrow to buyer (admin only)' })
  async refundEscrow(
    @Req() req: any,
    @Body() body: {
      dealId: string;
      buyerServiceName: string;
      buyerServiceNumber: string;
      buyerSecondaryServiceNumber?: string;
      buyerName: string;
      reason: string;
    },
  ) {
    return this.escrowService.refundEscrow({
      ...body,
      adminUserId: req.user.sub,
    });
  }

  // ── Marketplace Fees ────────────────────────────────────────────────────

  @Post('listing-fee')
  @UseGuards(JwtAuthGuard, KycGuard)
  @ApiOperation({ summary: 'Pay the listing fee to publish a listing' })
  async payListingFee(
    @Req() req: any,
    @Body() body: {
      listingId: string;
      serviceName: string;
      serviceNumber: string;
      secondaryServiceNumber?: string;
      paidBy: string;
    },
  ) {
    return this.escrowService.payListingFee({
      ...body,
      userId: req.user.sub,
    });
  }

  @Post('buyer-subscription')
  @UseGuards(JwtAuthGuard, KycGuard)
  @ApiOperation({ summary: 'Pay buyer premium subscription' })
  async payBuyerSubscription(
    @Req() req: any,
    @Body() body: {
      serviceName: string;
      serviceNumber: string;
      secondaryServiceNumber?: string;
      paidBy: string;
    },
  ) {
    return this.escrowService.payBuyerSubscription({
      ...body,
      userId: req.user.sub,
    });
  }

  // ── Admin: Deal Payments ────────────────────────────────────────────────

  @Get('deal/:dealId/payments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all payments for a deal' })
  async getDealPayments(@Param('dealId') dealId: string) {
    return this.gtpayService.getDealPayments(dealId);
  }
}
