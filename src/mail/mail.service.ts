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
