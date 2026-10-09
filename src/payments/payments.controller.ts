import { Controller, Post, Body } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaystackService } from './paystack.service';

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
