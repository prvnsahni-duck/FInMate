import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EmailService {
  private readonly resendApiKey: string | null = null;
  private readonly fromEmail: string;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    this.resendApiKey = this.configService.get<string>('RESEND_API_KEY') || null;
    this.fromEmail = this.configService.get<string>('FROM_EMAIL') || 'noreply@finmate.app';

    if (!this.resendApiKey) {
      this.logger.warn('RESEND_API_KEY is not set. Emails will be logged to the console instead of being sent.');
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (this.resendApiKey) {
      try {
        await axios.post(
          'https://api.resend.com/emails',
          {
            from: this.fromEmail,
            to,
            subject,
            html,
          },
          {
            headers: {
              Authorization: `Bearer ${this.resendApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        this.logger.log(`Email sent successfully to ${to}`);
      } catch (error: any) {
        const errorData = error.response?.data || error.message;
        this.logger.error(`Failed to send email to ${to}:`, errorData);
        throw error;
      }
    } else {
      this.logger.log(`[MOCK EMAIL]
From: ${this.fromEmail}
To: ${to}
Subject: ${subject}
Content:
${html}
=====================`);
    }
  }

  async sendInviteEmail(toEmail: string, groupName: string, inviteUrl: string, inviterName: string): Promise<void> {
    const subject = `You're invited to join the group "${groupName}" on FinMate`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #333;">Group Invitation</h2>
        <p>Hi there,</p>
        <p><strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on <strong>FinMate</strong>.</p>
        <p>Use the link below to accept the invitation and start tracking split expenses:</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${inviteUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Join Group</a>
        </div>
        <p style="color: #666; font-size: 14px;">If you don't have a FinMate account yet, you will be prompted to create one when you click the link.</p>
        <hr style="border: 0; border-top: 1px solid #eee;" />
        <p style="color: #999; font-size: 12px;">This invitation was sent automatically. If you did not expect this invitation, please ignore this email.</p>
      </div>
    `;
    await this.sendEmail(toEmail, subject, html);
  }

  async sendVerificationEmail(toEmail: string, verificationUrl: string): Promise<void> {
    const subject = 'Verify your email - FinMate';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #333;">Welcome to FinMate!</h2>
        <p>Thank you for signing up. Please verify your email address to activate your account:</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${verificationUrl}" style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #eee;" />
        <p style="color: #999; font-size: 12px;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `;
    await this.sendEmail(toEmail, subject, html);
  }

  async sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your password - FinMate';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #333;">Password Reset</h2>
        <p>We received a request to reset your password. Click the link below to set a new password:</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${resetUrl}" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
        </div>
        <p>This link is valid for 1 hour.</p>
        <hr style="border: 0; border-top: 1px solid #eee;" />
        <p style="color: #999; font-size: 12px;">If you did not request a password reset, please ignore this email.</p>
      </div>
    `;
    await this.sendEmail(toEmail, subject, html);
  }
}
