import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { GtpayService } from '../payments/gtpay.service';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private gtpayService: GtpayService,
  ) {}

  async createInvoice(dealId: string, buyerId: string, amount: number, description: string) {
    const invoice = await this.db.insert(schema.invoices).values({
      dealId,
      buyerId,
      amount,
      description,
      status: 'pending',
    }).returning();

    return invoice[0];
  }

  async getDealInvoices(dealId: string) {
    return this.db.select().from(schema.invoices).where(eq(schema.invoices.dealId, dealId));
  }

  /**
   * Initiate payment for an invoice via GTPay.
   * The buyer provides their wallet/bank details and the payment is processed.
   */
  async payInvoice(invoiceId: string, userId: string, paymentDetails: {
    serviceName: string; // debitwallet or banktrf
    serviceNumber: string;
    secondaryServiceNumber?: string;
    paidBy: string;
  }) {
    const invoiceRecord = await this.db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
    if (!invoiceRecord.length) throw new NotFoundException('Invoice not found');

    const invoice = invoiceRecord[0];
    if (invoice.status !== 'pending') throw new BadRequestException('Invoice is not pending');

    // Amount is stored in cents/pesewas, GTPay wants GHS
    const amountGhs = invoice.amount / 100;

    const payment = await this.gtpayService.initiatePayment({
      userId,
      purpose: 'escrow_deposit',
      serviceName: paymentDetails.serviceName,
      serviceNumber: paymentDetails.serviceNumber,
      secondaryServiceNumber: paymentDetails.secondaryServiceNumber,
      amount: amountGhs,
      paidBy: paymentDetails.paidBy,
      remarks: `Invoice payment: ${invoice.description}`,
      dealId: invoice.dealId,
    });

    // Update the invoice with the GTPay reference
    await this.db.update(schema.invoices)
      .set({ paystackRef: payment.partnerTransId }) // reuse paystackRef column for GTPay ref
      .where(eq(schema.invoices.id, invoiceId));

    if (payment.status === 'completed') {
      await this.db.update(schema.invoices)
        .set({ status: 'paid', paidAt: new Date() })
        .where(eq(schema.invoices.id, invoiceId));
    }

    return {
      invoiceId: invoice.id,
      paymentId: payment.paymentId,
      partnerTransId: payment.partnerTransId,
      status: payment.status,
      amount: amountGhs,
      currency: 'GHS',
    };
  }

  async markAsPaid(invoiceId: string) {
    return this.db.update(schema.invoices)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(schema.invoices.id, invoiceId))
      .returning();
  }

  async releaseFunds(invoiceId: string) {
    return this.db.update(schema.invoices)
      .set({ status: 'released', releasedAt: new Date() })
      .where(eq(schema.invoices.id, invoiceId))
      .returning();
  }
}
