import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not defined in the environment variables. Emails will be logged but not sent.');
    }
    this.resend = new Resend(apiKey || 're_dummy_key_just_for_instantiation');
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      if (!process.env.RESEND_API_KEY) {
        this.logger.log(`Mock Email sent to ${to}: ${subject}`);
        return { data: { id: 'mock-id' }, error: null };
      }
      
      const response = await this.resend.emails.send({
        from: 'Digital Fortuna <onboarding@resend.dev>', // Should be a verified domain in production
        to,
        subject,
        html,
      });
      
      if (response.error) {
        this.logger.error(`Resend API error sending email to ${to}: ${response.error.message}`);
      } else {
        this.logger.log(`Email sent to ${to} with ID ${response.data?.id}`);
      }
      
      return response;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendWelcomeEmail(to: string, name: string) {
    const subject = 'Welcome to Digital Fortuna';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0A0F1E;">Welcome to Digital Fortuna, ${name}!</h2>
        <p>We're thrilled to have you join our platform where elite codebases find elite capital.</p>
        <p>Explore the live catalog or list your own startup today.</p>
        <br />
        <p>Best regards,<br/><strong>The Digital Fortuna Team</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  async sendListingCreatedEmail(to: string, title: string) {
    const subject = 'Your Startup Listing is Live';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0A0F1E;">Listing Created Successfully!</h2>
        <p>Your startup <strong>${title}</strong> has been submitted to Digital Fortuna.</p>
        <p>Our team is currently running the due diligence process and will contact you shortly.</p>
        <br />
        <p>Best regards,<br/><strong>The Digital Fortuna Team</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  async sendBrokerNotificationEmail(to: string, userName: string, listingTitle: string) {
    const subject = 'New Broker Inquiry';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0A0F1E;">New Inquiry Received</h2>
        <p>User <strong>${userName}</strong> is interested in acquiring <strong>${listingTitle}</strong>.</p>
        <p>Please review the deal room and reach out to the buyer.</p>
        <br />
        <p>Best regards,<br/><strong>Digital Fortuna Automated System</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  async sendKycSubmittedEmail(to: string, name: string) {
    const subject = 'KYC Verification Submitted - Digital Fortuna';
    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #f8fafc; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0A0F1E; margin: 0;">Identity Verification Received</h2>
        </div>
        <p>Dear ${name},</p>
        <p>We have received your KYC (Know Your Customer) verification documents. Our compliance team will review your submission within <strong>1-3 business days</strong>.</p>
        <div style="background: #e0f2fe; border-left: 4px solid #0080FF; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px;"><strong>What happens next?</strong></p>
          <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 14px;">
            <li>Our team reviews your identity documents</li>
            <li>We verify the information against our compliance requirements</li>
            <li>You will receive an email notification once the review is complete</li>
          </ul>
        </div>
        <p>You can check your verification status at any time from your dashboard.</p>
        <br />
        <p>Best regards,<br/><strong>Digital Fortuna Compliance Team</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  async sendKycApprovedEmail(to: string, name: string) {
    const subject = 'KYC Verified - You Are Approved! - Digital Fortuna';
    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #f8fafc; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #dcfce7; border-radius: 50%; padding: 16px; margin-bottom: 12px;">
            <span style="font-size: 32px;">&#9989;</span>
          </div>
          <h2 style="color: #166534; margin: 0;">Identity Verified Successfully</h2>
        </div>
        <p>Dear ${name},</p>
        <p>Congratulations! Your KYC verification has been <strong>approved</strong>. Your account is now fully verified on Digital Fortuna.</p>
        <div style="background: #dcfce7; border-left: 4px solid #16a34a; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px;"><strong>You can now:</strong></p>
          <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 14px;">
            <li>Submit and receive acquisition offers</li>
            <li>Access deal rooms and escrow services</li>
            <li>Generate and sign transaction documents (NDA, LOI, APA)</li>
            <li>Participate in due diligence processes</li>
          </ul>
        </div>
        <p>Visit your <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="color: #0080FF; text-decoration: underline;">dashboard</a> to get started.</p>
        <br />
        <p>Best regards,<br/><strong>Digital Fortuna Compliance Team</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  async sendKycRejectedEmail(to: string, name: string, reason: string) {
    const subject = 'KYC Verification Update - Action Required - Digital Fortuna';
    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #f8fafc; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #fee2e2; border-radius: 50%; padding: 16px; margin-bottom: 12px;">
            <span style="font-size: 32px;">&#10060;</span>
          </div>
          <h2 style="color: #991b1b; margin: 0;">Verification Not Approved</h2>
        </div>
        <p>Dear ${name},</p>
        <p>Unfortunately, your KYC verification could not be approved at this time.</p>
        <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-size: 14px; font-weight: bold;">Reason:</p>
          <p style="margin: 0; font-size: 14px;">${reason}</p>
        </div>
        <p><strong>What you can do:</strong></p>
        <ul style="font-size: 14px; padding-left: 20px;">
          <li>Review the reason above and correct any issues</li>
          <li>Ensure your ID document is clear, valid, and not expired</li>
          <li>Re-submit your verification from your <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="color: #0080FF;">dashboard</a></li>
        </ul>
        <p>If you believe this is an error, please contact our support team.</p>
        <br />
        <p>Best regards,<br/><strong>Digital Fortuna Compliance Team</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  async sendPasswordResetEmail(to: string, resetLink: string) {
    const subject = 'Reset your Digital Fortuna Password';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0A0F1E;">Password Reset Request</h2>
        <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #0080FF; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a></p>
        <p>Or copy and paste this URL into your browser:</p>
        <p>${resetLink}</p>
        <br />
        <p>Best regards,<br/><strong>The Digital Fortuna Team</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }
}
