import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StripeService } from './stripe.service';
import { PaystackService } from './paystack.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { KycGuard } from '../auth/kyc.guard';

@ApiTags('Payments')
@UseGuards(JwtAuthGuard, KycGuard)
@ApiBearerAuth('JWT-auth')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly paystackService: PaystackService,
  ) {}

  @Post('stripe/checkout')
  async createStripeCheckout(@Body() body: { amount: number; currency: string; listingId: string }) {
    return this.stripeService.createCheckoutSession(body.amount, body.currency, body.listingId);
  }

  @Post('paystack/checkout')
  async createPaystackCheckout(@Body() body: { amount: number; email: string; listingId: string }) {
    return this.paystackService.initializeTransaction(body.amount, body.email, body.listingId);
  }
}
