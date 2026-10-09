import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const Paystack = require('paystack-api') as (secret: string) => any;

@Injectable()
export class PaystackService {
  private paystack: any;

  constructor(private configService: ConfigService) {
    this.paystack = Paystack(this.configService.get<string>('PAYSTACK_SECRET_KEY') || 'sk_test_mock');
  }

  async initializeTransaction(amount: number, email: string, listingId: string) {
    return this.paystack.transaction.initialize({
      email,
      amount: amount * 100, // Paystack expects base currency units (kobo/pesewas)
      reference: `LISTING_${listingId}_${Date.now()}`,
      callback_url: `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/success`,
    });
  }
}
