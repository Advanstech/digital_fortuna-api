import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaystackService } from './paystack.service';
import { GtpayService } from './gtpay.service';
import { EscrowService } from './escrow.service';
import { PaymentsController } from './payments.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [PaymentsController],
  providers: [StripeService, PaystackService, GtpayService, EscrowService],
  exports: [StripeService, PaystackService, GtpayService, EscrowService],
})
export class PaymentsModule {}
