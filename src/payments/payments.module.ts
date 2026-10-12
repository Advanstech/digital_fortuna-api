import { Module } from '@nestjs/common';
import { GtpayService } from './gtpay.service';
import { EscrowService } from './escrow.service';
import { PaymentsController } from './payments.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [PaymentsController],
  providers: [GtpayService, EscrowService],
  exports: [GtpayService, EscrowService],
})
export class PaymentsModule {}
