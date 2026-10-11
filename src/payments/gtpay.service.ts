import { Injectable, Inject, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * GTPay Service — proxies to the GTBank Partner API via the Lidapay gateway.
 * 
 * Available services:
 *   - creditwallet: Credit a mobile wallet
 *   - debitwallet: Debit a mobile wallet
 *   - banktrf: Bank transfer (GIP)
 * 
 * Flow:
 *   1. Client calls our /payments/gtpay/* endpoints
 *   2. We persist a payment record, then call the Lidapay GTPay proxy
 *   3. GTBank responds PENDING (async) or COMPLETED/FAILED
 *   4. GTBank posts final status to our callback endpoint
 *   5. We reconcile and update the payment record
 */
@Injectable()
export class GtpayService {
  private readonly logger = new Logger(GtpayService.name);
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  // Lidapay gateway credentials
  private readonly username: string;
  private readonly password: string;

  constructor(
    private configService: ConfigService,
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
  ) {
    this.baseUrl = this.configService.get<string>('GTPAY_API_URL') || 'https://web-production-7b9472.up.railway.app';
    this.username = this.configService.get<string>('GTPAY_USERNAME') || '';
    this.password = this.configService.get<string>('GTPAY_PASSWORD') || '';
  }

  /** Authenticate with the Lidapay gateway and get a bearer token */
  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        this.logger.error('GTPay auth failed', err);
        throw new InternalServerErrorException('Payment gateway authentication failed');
      }

      const data = await res.json();
      this.accessToken = data.access_token;
      // Refresh 5 minutes before expiry (tokens typically last 1 hour)
      this.tokenExpiry = Date.now() + 50 * 60 * 1000;
      return this.accessToken!;
    } catch (err: any) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error('GTPay auth error', err.message);
      throw new InternalServerErrorException('Payment gateway unavailable');
    }
  }

  private async request(path: string, method: string = 'POST', body?: any): Promise<any> {
    const token = await this.authenticate();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      this.logger.warn(`GTPay ${path} failed: ${res.status}`, json);
      throw new BadRequestException(json.message || `GTPay request failed: ${res.status}`);
    }

    return json;
  }

  /** Generate a unique PartnerTransId (max 20 numeric chars) */
  private generatePartnerTransId(): string {
    return Date.now().toString() + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  }

  // ── Public API Methods ─────────────────────────────────────────────────

  /** List available GTPay services */
  async getServices(): Promise<any> {
    return this.request('/api/v1/gtpay/services');
  }

  /** Query / verify account details */
  async query(serviceName: string, serviceNumber?: string, secondaryServiceNumber?: string): Promise<any> {
    return this.request('/api/v1/gtpay/query', 'POST', {
      ServiceName: serviceName,
      ServiceNumber: serviceNumber || '',
      SecondaryServiceNumber: secondaryServiceNumber || '',
    });
  }

  /** Get list of supported banks */
  async getBanks(): Promise<any> {
    return this.request('/api/v1/gtpay/banks', 'POST');
  }

  /** Check payment status by PartnerTransId */
  async getStatus(partnerTransId: string): Promise<any> {
    const result = await this.request('/api/v1/gtpay/status', 'POST', {
      PartnerTransId: partnerTransId,
    });

    // Also update our local record
    await this.reconcilePayment(partnerTransId, result.data || result);

    return result;
  }

  /**
   * Initiate a payment and persist the record.
   * 
   * @param userId - The DFC user making the payment
   * @param purpose - Why this payment is being made
   * @param serviceDetails - GTPay ServiceDetails object
   * @param dealId - Optional deal this payment is for
   * @param listingId - Optional listing this payment is for
   */
  async initiatePayment(params: {
    userId: string;
    purpose: 'escrow_deposit' | 'listing_fee' | 'success_fee' | 'buyer_subscription' | 'refund' | 'escrow_release' | 'other';
    serviceName: string;
    serviceNumber: string;
    secondaryServiceNumber?: string;
    amount: number; // in GHS (will be sent as string to GTPay)
    paidBy: string;
    payeeName?: string;
    remarks: string;
    dealId?: string;
    listingId?: string;
  }): Promise<any> {
    const partnerTransId = this.generatePartnerTransId();
    const amountPesewas = Math.round(params.amount * 100);

    // Persist payment record before calling GTPay
    const [payment] = await this.db.insert(schema.gtpayPayments).values({
      userId: params.userId,
      dealId: params.dealId || null,
      listingId: params.listingId || null,
      partnerTransId,
      serviceName: params.serviceName,
      serviceNumber: params.serviceNumber,
      secondaryServiceNumber: params.secondaryServiceNumber || null,
      amount: amountPesewas,
      purpose: params.purpose,
      status: 'pending',
      paidBy: params.paidBy,
      payeeName: params.payeeName || null,
      remarks: params.remarks,
    }).returning();

    try {
      const result = await this.request('/api/v1/gtpay/pay', 'POST', {
        PartnerTransId: partnerTransId,
        ServiceDetails: {
          ServiceName: params.serviceName,
          ServiceNumber: params.serviceNumber,
          SecondaryServiceNumber: params.secondaryServiceNumber || '',
          Amount: params.amount.toFixed(2),
          Remarks: params.remarks,
          PaidBy: params.paidBy,
          PayeeName: params.payeeName || '',
        },
      });

      const gtbData = result.data || result;
      const gtbStatus = gtbData.Status || 'PENDING';

      // Update record with GTBank response
      await this.db.update(schema.gtpayPayments)
        .set({
          gtbTransId: gtbData.GTBTransId || null,
          providerTransId: gtbData.ProviderTransId || null,
          gtbStatus,
          status: this.mapGtbStatus(gtbStatus),
          recoveredAfterTimeout: gtbData.RecoveredAfterTimeout || false,
          metadata: gtbData,
          updatedAt: new Date(),
          completedAt: gtbStatus === 'COMPLETED' ? new Date() : null,
        })
        .where(eq(schema.gtpayPayments.id, payment.id));

      return {
        paymentId: payment.id,
        partnerTransId,
        gtbTransId: gtbData.GTBTransId,
        status: this.mapGtbStatus(gtbStatus),
        gtbStatus,
        amount: params.amount,
        currency: 'GHS',
        purpose: params.purpose,
      };
    } catch (err: any) {
      // Update payment as failed
      await this.db.update(schema.gtpayPayments)
        .set({
          status: 'failed',
          gtbStatus: 'ERROR',
          metadata: { error: err.message },
          updatedAt: new Date(),
        })
        .where(eq(schema.gtpayPayments.id, payment.id));

      throw err;
    }
  }

  /**
   * Handle GTBank callback — reconcile the payment.
   * The callback is treated as a notification; we verify via /status.
   */
  async handleCallback(callbackData: any): Promise<any> {
    const partnerTransId = callbackData.PartnerTransId;
    if (!partnerTransId) {
      throw new BadRequestException('Missing PartnerTransId in callback');
    }

    this.logger.log(`GTPay callback received for ${partnerTransId}: ${callbackData.Status}`);

    // Verify via status endpoint (authoritative)
    let statusResult;
    try {
      statusResult = await this.request('/api/v1/gtpay/status', 'POST', {
        PartnerTransId: partnerTransId,
      });
    } catch {
      // If status check fails, use the callback data as-is
      statusResult = { data: callbackData };
    }

    await this.reconcilePayment(partnerTransId, statusResult.data || statusResult, true);

    return { success: true, partnerTransId };
  }

  /** Reconcile a payment record from GTBank status data */
  private async reconcilePayment(partnerTransId: string, gtbData: any, fromCallback = false): Promise<void> {
    const gtbStatus = gtbData.Status || 'PENDING';
    const newStatus = this.mapGtbStatus(gtbStatus);

    const updates: any = {
      gtbStatus,
      status: newStatus,
      metadata: gtbData,
      updatedAt: new Date(),
    };

    if (gtbData.GTBTransId) updates.gtbTransId = gtbData.GTBTransId;
    if (gtbData.ProviderTransId) updates.providerTransId = gtbData.ProviderTransId;
    if (fromCallback) updates.callbackReceived = true;
    if (newStatus === 'completed') updates.completedAt = new Date();

    await this.db.update(schema.gtpayPayments)
      .set(updates)
      .where(eq(schema.gtpayPayments.partnerTransId, partnerTransId));
  }

  /** Map GTBank status strings to our enum */
  private mapGtbStatus(gtbStatus: string): 'pending' | 'completed' | 'failed' | 'unknown' {
    switch (gtbStatus?.toUpperCase()) {
      case 'COMPLETED': return 'completed';
      case 'FAILED': return 'failed';
      case 'PENDING': return 'pending';
      default: return 'unknown';
    }
  }

  /** Get payment by ID */
  async getPaymentById(paymentId: string) {
    const [payment] = await this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.id, paymentId))
      .limit(1);
    return payment || null;
  }

  /** Get payment by PartnerTransId */
  async getPaymentByTransId(partnerTransId: string) {
    const [payment] = await this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.partnerTransId, partnerTransId))
      .limit(1);
    return payment || null;
  }

  /** Get all payments for a user */
  async getUserPayments(userId: string) {
    return this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.userId, userId))
      .orderBy(schema.gtpayPayments.createdAt);
  }

  /** Get all payments for a deal */
  async getDealPayments(dealId: string) {
    return this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.dealId, dealId))
      .orderBy(schema.gtpayPayments.createdAt);
  }
}
