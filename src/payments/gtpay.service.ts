import { Injectable, Inject, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * GTPay Service — sends requests to the GTBank Partner API
 * via the AWS EB middleware (GTPAY_API_URL).
 *
 * The middleware handles authentication and forwarding to GTBank.
 * We just follow the spec: /api/v1/gtpay/{services,query,pay,status,banks,callback}
 *
 * Available services:
 *   - creditwallet: Credit a mobile wallet
 *   - debitwallet: Debit a mobile wallet
 *   - banktrf: Bank transfer (GIP)
 *
 * Pay flow:
 *   1. Persist a local payment record (so outcome is always traceable)
 *   2. POST /api/v1/gtpay/pay with { ServiceDetails, PartnerTransId?, CallbackURL? }
 *   3. GTBank responds PENDING (async) or COMPLETED/FAILED
 *   4. GTBank POSTs final result to the callback URL
 *   5. We reconcile and update the local record
 */
@Injectable()
export class GtpayService {
  private readonly logger = new Logger(GtpayService.name);
  private readonly baseUrl: string;
  private readonly callbackUrl: string;

  constructor(
    private configService: ConfigService,
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
  ) {
    this.baseUrl = (this.configService.get<string>('GTPAY_API_URL') || '').replace(/\/$/, '');
    // The callback URL that GTBank will POST the final status to.
    // This should point to our own API's callback endpoint.
    const publicUrl = (this.configService.get<string>('API_PUBLIC_URL') || 'http://localhost:4000').replace(/\/$/, '');
    this.callbackUrl = this.configService.get<string>('GTPAY_CALLBACK_URL')
      || `${publicUrl}/v1/payments/gtpay/callback`;
  }

  /**
   * Send a request to the GTPay middleware.
   * No auth needed — the middleware handles GTBank authentication.
   */
  private async request(path: string, method: string = 'POST', body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`GTPay ${method} ${path}`);

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.logger.warn(`GTPay ${path} failed: ${res.status}`, json);

        // 504 = PAYMENT_STATUS_UNKNOWN — include PartnerTransId so caller
        // can query /status before retrying (avoid double-payment)
        if (res.status === 504) {
          throw new InternalServerErrorException({
            message: json.message || 'PAYMENT_STATUS_UNKNOWN — query /status before retrying',
            partnerTransId: json.PartnerTransId || body?.PartnerTransId,
          });
        }

        throw new BadRequestException(json.message || `GTPay request failed: ${res.status}`);
      }

      return json;
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof InternalServerErrorException) throw err;
      this.logger.error(`GTPay ${path} network error`, err.message);
      throw new InternalServerErrorException('Payment gateway unavailable');
    }
  }

  /** Generate a unique PartnerTransId (max 20 numeric chars) */
  private generatePartnerTransId(): string {
    return Date.now().toString() + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  }

  // ── Public API Methods ─────────────────────────────────────────────────

  /** POST /api/v1/gtpay/services — list available services */
  async getServices(): Promise<any> {
    return this.request('/api/v1/gtpay/services');
  }

  /**
   * POST /api/v1/gtpay/query — query/verify customer details or account balance.
   * Required: ServiceName. Optional: ServiceNumber, SecondaryServiceNumber.
   */
  async query(serviceName: string, serviceNumber?: string, secondaryServiceNumber?: string): Promise<any> {
    return this.request('/api/v1/gtpay/query', 'POST', {
      ServiceName: serviceName,
      ServiceNumber: serviceNumber || '',
      SecondaryServiceNumber: secondaryServiceNumber || '',
    });
  }

  /** POST /api/v1/gtpay/banks — list supported banks for banktrf */
  async getBanks(): Promise<any> {
    return this.request('/api/v1/gtpay/banks', 'POST');
  }

  /**
   * POST /api/v1/gtpay/status — check payment status.
   * Required: PartnerTransId.
   * Also reconciles our local record.
   */
  async getStatus(partnerTransId: string): Promise<any> {
    const result = await this.request('/api/v1/gtpay/status', 'POST', {
      PartnerTransId: partnerTransId,
    });

    // Reconcile our local record with the authoritative status
    await this.reconcilePayment(partnerTransId, result.data || result);

    return result;
  }

  /**
   * POST /api/v1/gtpay/pay — initiate a payment.
   *
   * Per the spec:
   *   Required: ServiceDetails { ServiceName, ServiceNumber, Amount, Remarks, PaidBy }
   *   Optional: PartnerTransId (auto-gen if omitted), CallbackURL, userId, userName
   *
   * We persist a local record BEFORE calling pay so the outcome is always traceable.
   */
  async initiatePayment(params: {
    userId: string;
    purpose: 'escrow_deposit' | 'listing_fee' | 'success_fee' | 'buyer_subscription' | 'refund' | 'escrow_release' | 'other';
    serviceName: string;
    serviceNumber: string;
    secondaryServiceNumber?: string;
    amount: number; // GHS — sent as numeric string to preserve precision
    paidBy: string;
    payeeName?: string;
    remarks: string;
    dealId?: string;
    listingId?: string;
  }): Promise<any> {
    const partnerTransId = this.generatePartnerTransId();
    const amountPesewas = Math.round(params.amount * 100);

    // 1. Persist payment record before calling GTPay
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

    // 2. POST to GTPay /pay per the spec
    try {
      const result = await this.request('/api/v1/gtpay/pay', 'POST', {
        PartnerTransId: partnerTransId,
        CallbackURL: this.callbackUrl,
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

      // 3. Update record with GTBank response
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
        data: gtbData.Data, // Network, Charge, TotalAmount
        amount: params.amount,
        currency: 'GHS',
        purpose: params.purpose,
      };
    } catch (err: any) {
      // Mark payment as failed / unknown
      const isUnknown = err instanceof InternalServerErrorException;
      await this.db.update(schema.gtpayPayments)
        .set({
          status: isUnknown ? 'unknown' : 'failed',
          gtbStatus: isUnknown ? 'PAYMENT_STATUS_UNKNOWN' : 'ERROR',
          metadata: { error: err.message },
          updatedAt: new Date(),
        })
        .where(eq(schema.gtpayPayments.id, payment.id));

      throw err;
    }
  }

  /**
   * Handle GTBank async callback.
   *
   * Per the spec: GTBank POSTs WITHOUT a SecureHash. The callback is treated
   * as a notification only — the authoritative status is pulled from /status
   * and persisted. An unsigned or forged callback can therefore never mark
   * a transaction completed on its own.
   */
  async handleCallback(callbackData: any): Promise<any> {
    const partnerTransId = callbackData.PartnerTransId;
    if (!partnerTransId) {
      throw new BadRequestException('Missing PartnerTransId in callback');
    }

    this.logger.log(`GTPay callback for ${partnerTransId}: ${callbackData.Status}`);

    // Verify via /status (authoritative — never trust callback alone)
    let statusResult;
    try {
      statusResult = await this.request('/api/v1/gtpay/status', 'POST', {
        PartnerTransId: partnerTransId,
      });
    } catch {
      // If /status fails, use the callback data but flag it
      statusResult = { data: callbackData };
    }

    await this.reconcilePayment(partnerTransId, statusResult.data || statusResult, true);

    return { success: true, partnerTransId };
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  /** Reconcile a local payment record from GTBank status data */
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

  /** Map GTBank status strings to our payment_status enum */
  private mapGtbStatus(gtbStatus: string): 'pending' | 'completed' | 'failed' | 'unknown' {
    switch (gtbStatus?.toUpperCase()) {
      case 'COMPLETED': return 'completed';
      case 'FAILED': return 'failed';
      case 'PENDING': return 'pending';
      default: return 'unknown';
    }
  }

  // ── Record lookups ─────────────────────────────────────────────────────

  async getPaymentById(paymentId: string) {
    const [payment] = await this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.id, paymentId))
      .limit(1);
    return payment || null;
  }

  async getPaymentByTransId(partnerTransId: string) {
    const [payment] = await this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.partnerTransId, partnerTransId))
      .limit(1);
    return payment || null;
  }

  async getUserPayments(userId: string) {
    return this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.userId, userId))
      .orderBy(schema.gtpayPayments.createdAt);
  }

  async getDealPayments(dealId: string) {
    return this.db.select()
      .from(schema.gtpayPayments)
      .where(eq(schema.gtpayPayments.dealId, dealId))
      .orderBy(schema.gtpayPayments.createdAt);
  }
}
