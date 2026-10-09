import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const StripeCtor = require('stripe');

@Injectable()
export class StripeService {
  private stripe: any;

  constructor(private configService: ConfigService) {
    this.stripe = new StripeCtor(this.configService.get<string>('STRIPE_SECRET_KEY') || 'sk_test_mock', {
      apiVersion: '2026-04-22.dahlia' as any,
    });
  }

  async createCheckoutSession(amount: number, currency: string, listingId: string) {
    return this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Acquisition of Listing ${listingId}` },
          unit_amount: amount * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/success`,
      cancel_url: `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/cancel`,
    });
  }

  async createPaymentIntent(amount: number, currency: string) {
    return this.stripe.paymentIntents.create({
      amount: amount * 100,
      currency,
    });
  }
}
