import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { StripeService } from '../payments/stripe.service';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private stripeService: StripeService,
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

  async processPaymentIntent(invoiceId: string) {
    const invoiceRecord = await this.db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
    if (!invoiceRecord.length) throw new NotFoundException('Invoice not found');
    
    const invoice = invoiceRecord[0];
    // In a real flow, we would attach this to the customer's stripe account and create a PaymentIntent
    const pi = await this.stripeService.createPaymentIntent(invoice.amount, 'USD');

    // Update the invoice with the pi ID
    await this.db.update(schema.invoices)
      .set({ stripePaymentIntentId: pi.id })
      .where(eq(schema.invoices.id, invoiceId));

    return { clientSecret: pi.client_secret, invoiceId: invoice.id };
  }

  // Webhook or manual confirm endpoint would call this
  async markAsPaid(invoiceId: string) {
    return this.db.update(schema.invoices)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(schema.invoices.id, invoiceId))
      .returning();
  }

  async releaseFunds(invoiceId: string) {
    // Logic to release escrow funds to the seller
    return this.db.update(schema.invoices)
      .set({ status: 'released', releasedAt: new Date() })
      .where(eq(schema.invoices.id, invoiceId))
      .returning();
  }
}
