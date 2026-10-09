import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaystackService } from './paystack.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [StripeService, PaystackService],
  exports: [StripeService, PaystackService],
})
export class PaymentsModule {}
