import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { DbModule } from '../db/db.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [DbModule, PaymentsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
