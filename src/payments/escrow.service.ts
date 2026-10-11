import { Injectable, Inject, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { GtpayService } from './gtpay.service';
import { MailService } from '../mail/mail.service';

/**
 * Escrow Service — manages the escrow flow for marketplace deals.
 * 
 * Flow:
 *   1. Buyer deposits funds into escrow via GTPay (debit wallet / bank transfer)
 *   2. Seller transfers assets (code, domains, etc.)
 *   3. Buyer verifies assets
 *   4. Admin/platform releases escrow to seller (credit wallet / bank transfer)
 *   5. Platform deducts success fee before release
 * 
 * All movements are recorded in the escrow_ledger for audit.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  // Platform fee percentages
  static readonly SUCCESS_FEE_PERCENT = 8; // 8% of deal value
  static readonly LISTING_FEE_GHS = 49; // $49 equivalent in GHS
  static readonly BUYER_SUB_MONTHLY_GHS = 29; // $29/month

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private gtpayService: GtpayService,
    private mailService: MailService,
  ) {}

  /**
   * Deposit funds into escrow for a deal.
   * The buyer pays via GTPay (debit wallet or bank transfer).
   */
  async depositToEscrow(params: {
    dealId: string;
    userId: string;
    serviceName: string; // debitwallet or banktrf
    serviceNumber: string; // wallet number or bank account
    secondaryServiceNumber?: string; // bank code for banktrf
    amount: number; // GHS
    paidBy: string;
  }) {
    // Verify deal exists and user is the buyer
    const [deal] = await this.db.select()
      .from(schema.deals)
      .where(eq(schema.deals.id, params.dealId))
      .limit(1);

    if (!deal) throw new NotFoundException('Deal not found');
    if (deal.buyerId !== params.userId) throw new ForbiddenException('Only the buyer can deposit to escrow');
    if (deal.status === 'closed' || deal.status === 'cancelled') {
      throw new BadRequestException('Cannot deposit to a closed or cancelled deal');
    }

    // Initiate payment via GTPay
    const payment = await this.gtpayService.initiatePayment({
      userId: params.userId,
      purpose: 'escrow_deposit',
      serviceName: params.serviceName,
      serviceNumber: params.serviceNumber,
      secondaryServiceNumber: params.secondaryServiceNumber,
      amount: params.amount,
      paidBy: params.paidBy,
      remarks: `Escrow deposit for deal ${deal.id.split('-')[0]}`,
      dealId: params.dealId,
    });

    // Record in escrow ledger (pending until payment completes)
    if (payment.status === 'completed') {
      await this.recordEscrowEntry({
        dealId: params.dealId,
        paymentId: payment.paymentId,
        entryType: 'deposit',
        amount: Math.round(params.amount * 100),
        fromUserId: params.userId,
        description: `Escrow deposit via ${params.serviceName}`,
      });
    }

    return payment;
  }

  /**
   * Release escrow funds to the seller after deal completion.
   * Deducts the platform success fee first.
   * Only admin or platform can trigger this.
   */
  async releaseEscrow(params: {
    dealId: string;
    adminUserId: string;
    sellerServiceName: string; // creditwallet or banktrf
    sellerServiceNumber: string;
    sellerSecondaryServiceNumber?: string;
    sellerName: string;
  }) {
    const [deal] = await this.db.select()
      .from(schema.deals)
      .where(eq(schema.deals.id, params.dealId))
      .limit(1);

    if (!deal) throw new NotFoundException('Deal not found');

    // Calculate escrow balance
    const balance = await this.getEscrowBalance(params.dealId);
    if (balance <= 0) throw new BadRequestException('No funds in escrow to release');

    // Calculate fees
    const successFee = Math.round(balance * EscrowService.SUCCESS_FEE_PERCENT / 100);
    const sellerAmount = balance - successFee;
    const sellerAmountGhs = sellerAmount / 100; // Convert pesewas to GHS

    // Record fee deduction in ledger
    await this.recordEscrowEntry({
      dealId: params.dealId,
      entryType: 'fee_deduction',
      amount: successFee,
      description: `Platform success fee (${EscrowService.SUCCESS_FEE_PERCENT}%)`,
    });

    // Record fee in marketplace_fees table
    await this.db.insert(schema.marketplaceFees).values({
      dealId: params.dealId,
      userId: deal.sellerId,
      feeType: 'success_fee',
      amount: successFee,
      status: 'paid',
      paidAt: new Date(),
    });

    // Transfer to seller via GTPay
    const payment = await this.gtpayService.initiatePayment({
      userId: deal.sellerId,
      purpose: 'escrow_release',
      serviceName: params.sellerServiceName,
      serviceNumber: params.sellerServiceNumber,
      secondaryServiceNumber: params.sellerSecondaryServiceNumber,
      amount: sellerAmountGhs,
      paidBy: 'Digital Fortuna Computing',
      payeeName: params.sellerName,
      remarks: `Escrow release for deal ${deal.id.split('-')[0]} (minus ${EscrowService.SUCCESS_FEE_PERCENT}% fee)`,
      dealId: params.dealId,
    });

    // Record release in ledger
    await this.recordEscrowEntry({
      dealId: params.dealId,
      paymentId: payment.paymentId,
      entryType: 'release',
      amount: sellerAmount,
      toUserId: deal.sellerId,
      description: `Escrow release to seller via ${params.sellerServiceName}`,
    });

    // Update deal status to closed
    await this.db.update(schema.deals)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(schema.deals.id, params.dealId));

    return {
      dealId: params.dealId,
      totalEscrow: balance / 100,
      successFee: successFee / 100,
      sellerPayout: sellerAmountGhs,
      paymentStatus: payment.status,
      currency: 'GHS',
    };
  }

  /**
   * Refund escrow to the buyer (e.g. deal cancelled).
   */
  async refundEscrow(params: {
    dealId: string;
    adminUserId: string;
    buyerServiceName: string;
    buyerServiceNumber: string;
    buyerSecondaryServiceNumber?: string;
    buyerName: string;
    reason: string;
  }) {
    const [deal] = await this.db.select()
      .from(schema.deals)
      .where(eq(schema.deals.id, params.dealId))
      .limit(1);

    if (!deal) throw new NotFoundException('Deal not found');

    const balance = await this.getEscrowBalance(params.dealId);
    if (balance <= 0) throw new BadRequestException('No funds in escrow to refund');

    const refundAmountGhs = balance / 100;

    // Transfer back to buyer via GTPay
    const payment = await this.gtpayService.initiatePayment({
      userId: deal.buyerId,
      purpose: 'refund',
      serviceName: params.buyerServiceName,
      serviceNumber: params.buyerServiceNumber,
      secondaryServiceNumber: params.buyerSecondaryServiceNumber,
      amount: refundAmountGhs,
      paidBy: 'Digital Fortuna Computing',
      payeeName: params.buyerName,
      remarks: `Escrow refund for deal ${deal.id.split('-')[0]}: ${params.reason}`,
      dealId: params.dealId,
    });

    // Record refund in ledger
    await this.recordEscrowEntry({
      dealId: params.dealId,
      paymentId: payment.paymentId,
      entryType: 'refund',
      amount: balance,
      toUserId: deal.buyerId,
      description: `Escrow refund: ${params.reason}`,
    });

    // Update deal status
    await this.db.update(schema.deals)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.deals.id, params.dealId));

    return {
      dealId: params.dealId,
      refundAmount: refundAmountGhs,
      paymentStatus: payment.status,
      currency: 'GHS',
    };
  }

  /** Get the current escrow balance for a deal (in pesewas) */
  async getEscrowBalance(dealId: string): Promise<number> {
    const entries = await this.db.select()
      .from(schema.escrowLedger)
      .where(eq(schema.escrowLedger.dealId, dealId));

    let balance = 0;
    for (const entry of entries) {
      if (entry.entryType === 'deposit') {
        balance += entry.amount;
      } else {
        balance -= entry.amount;
      }
    }
    return Math.max(0, balance);
  }

  /** Get escrow ledger entries for a deal */
  async getEscrowLedger(dealId: string) {
    return this.db.select()
      .from(schema.escrowLedger)
      .where(eq(schema.escrowLedger.dealId, dealId))
      .orderBy(schema.escrowLedger.createdAt);
  }

  /** Record an escrow ledger entry */
  private async recordEscrowEntry(params: {
    dealId: string;
    paymentId?: string;
    entryType: string;
    amount: number;
    fromUserId?: string;
    toUserId?: string;
    description: string;
  }) {
    // Calculate running balance
    const currentBalance = await this.getEscrowBalance(params.dealId);
    const balanceAfter = params.entryType === 'deposit'
      ? currentBalance + params.amount
      : currentBalance - params.amount;

    await this.db.insert(schema.escrowLedger).values({
      dealId: params.dealId,
      paymentId: params.paymentId || null,
      entryType: params.entryType,
      amount: params.amount,
      fromUserId: params.fromUserId || null,
      toUserId: params.toUserId || null,
      description: params.description,
      balanceAfter: Math.max(0, balanceAfter),
    });
  }

  /**
   * Pay a listing fee when a seller publishes a listing.
   */
  async payListingFee(params: {
    listingId: string;
    userId: string;
    serviceName: string;
    serviceNumber: string;
    secondaryServiceNumber?: string;
    paidBy: string;
  }) {
    const payment = await this.gtpayService.initiatePayment({
      userId: params.userId,
      purpose: 'listing_fee',
      serviceName: params.serviceName,
      serviceNumber: params.serviceNumber,
      secondaryServiceNumber: params.secondaryServiceNumber,
      amount: EscrowService.LISTING_FEE_GHS,
      paidBy: params.paidBy,
      remarks: `Listing fee for listing ${params.listingId.split('-')[0]}`,
      listingId: params.listingId,
    });

    // Record the fee
    await this.db.insert(schema.marketplaceFees).values({
      listingId: params.listingId,
      userId: params.userId,
      feeType: 'listing_fee',
      amount: Math.round(EscrowService.LISTING_FEE_GHS * 100),
      paymentId: payment.paymentId,
      status: payment.status === 'completed' ? 'paid' : 'pending',
      paidAt: payment.status === 'completed' ? new Date() : null,
    });

    return payment;
  }

  /**
   * Pay buyer subscription fee.
   */
  async payBuyerSubscription(params: {
    userId: string;
    serviceName: string;
    serviceNumber: string;
    secondaryServiceNumber?: string;
    paidBy: string;
  }) {
    const payment = await this.gtpayService.initiatePayment({
      userId: params.userId,
      purpose: 'buyer_subscription',
      serviceName: params.serviceName,
      serviceNumber: params.serviceNumber,
      secondaryServiceNumber: params.secondaryServiceNumber,
      amount: EscrowService.BUYER_SUB_MONTHLY_GHS,
      paidBy: params.paidBy,
      remarks: 'Digital Fortuna Premium Buyer Subscription',
    });

    // Update user subscription tier
    if (payment.status === 'completed') {
      await this.db.update(schema.users)
        .set({ subscriptionTier: 'premium' })
        .where(eq(schema.users.id, params.userId));
    }

    // Record the fee
    await this.db.insert(schema.marketplaceFees).values({
      userId: params.userId,
      feeType: 'buyer_subscription',
      amount: Math.round(EscrowService.BUYER_SUB_MONTHLY_GHS * 100),
      paymentId: payment.paymentId,
      status: payment.status === 'completed' ? 'paid' : 'pending',
      paidAt: payment.status === 'completed' ? new Date() : null,
    });

    return payment;
  }

  /** Get all fees for a user */
  async getUserFees(userId: string) {
    return this.db.select()
      .from(schema.marketplaceFees)
      .where(eq(schema.marketplaceFees.userId, userId))
      .orderBy(schema.marketplaceFees.createdAt);
  }

  /**
   * When a GTPay payment completes (via callback), update related records.
   */
  async onPaymentCompleted(paymentId: string) {
    const payment = await this.gtpayService.getPaymentById(paymentId);
    if (!payment || payment.status !== 'completed') return;

    // If this was an escrow deposit, add to ledger
    if (payment.purpose === 'escrow_deposit' && payment.dealId) {
      const existing = await this.db.select()
        .from(schema.escrowLedger)
        .where(and(
          eq(schema.escrowLedger.paymentId, paymentId),
          eq(schema.escrowLedger.entryType, 'deposit'),
        ))
        .limit(1);

      if (!existing.length) {
        await this.recordEscrowEntry({
          dealId: payment.dealId,
          paymentId: payment.id,
          entryType: 'deposit',
          amount: payment.amount,
          fromUserId: payment.userId,
          description: `Escrow deposit via ${payment.serviceName}`,
        });
      }
    }

    // If this was a listing fee, mark as paid
    if (payment.purpose === 'listing_fee') {
      await this.db.update(schema.marketplaceFees)
        .set({ status: 'paid', paidAt: new Date() })
        .where(eq(schema.marketplaceFees.paymentId, paymentId));
    }

    // If this was a buyer subscription, update tier
    if (payment.purpose === 'buyer_subscription') {
      await this.db.update(schema.users)
        .set({ subscriptionTier: 'premium' })
        .where(eq(schema.users.id, payment.userId));

      await this.db.update(schema.marketplaceFees)
        .set({ status: 'paid', paidAt: new Date() })
        .where(eq(schema.marketplaceFees.paymentId, paymentId));
    }
  }
}
