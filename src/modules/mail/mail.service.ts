import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  constructor(private config: ConfigService) {
    const port = +(config.get<number>('MAIL_PORT') ?? 465);
    const secure =
      config.get<string>('MAIL_SECURE') === 'true' ||
      (port === 465 && config.get('MAIL_SECURE') === undefined);

    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_HOST'),
      port: port,
      secure: secure,
      auth: {
        user: config.get('MAIL_USER'),
        pass: config.get('MAIL_PASS'),
      },
      // Conservative settings for better reliability
      pool: true,
      maxConnections: 10, // Reduced for stability
      maxMessages: 50,
      rateDelta: 2000, // Increased to 2 seconds
      rateLimit: 10, // Reduced rate limit
      socketTimeout: 15000,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      dnsTimeout: 10000,
    });

    this.verifyTransporter();
  }

  private async verifyTransporter() {
    try {
      await this.transporter.verify();
      // console.log('✓ Mail transporter verified and ready');
    } catch (error) {
      this.logger.error('✗ Mail transporter verification failed:', error);
    }
  }

  async sendEmail(to: string, subject: string, text: string) {
    try {
      let templatePath = path.join(__dirname, 'templates', 'email.ejs');

      // Robust path resolution fallback for production/build environments
      if (!fs.existsSync(templatePath)) {
        // Try to find it relative to the process root if __dirname resolution fails
        const rootTemplatePath = path.join(
          process.cwd(),
          'dist',
          'modules',
          'mail',
          'templates',
          'email.ejs',
        );
        if (fs.existsSync(rootTemplatePath)) {
          templatePath = rootTemplatePath;
        } else {
          // Third fallback: dist/src/... (just in case)
          const srcTemplatePath = path.join(
            process.cwd(),
            'dist',
            'src',
            'modules',
            'mail',
            'templates',
            'email.ejs',
          );
          if (fs.existsSync(srcTemplatePath)) {
            templatePath = srcTemplatePath;
          } else {
            // Fourth fallback: src/... (load directly from source folder if dist copies failed)
            const sourceTemplatePath = path.join(
              process.cwd(),
              'src',
              'modules',
              'mail',
              'templates',
              'email.ejs',
            );
            if (fs.existsSync(sourceTemplatePath)) {
              templatePath = sourceTemplatePath;
            }
          }
        }
      }

      this.logger.debug(`Using mail template at: ${templatePath}`);

      const html = await ejs.renderFile(templatePath, {
        title: subject,
        content: text
          .replace(/\n/g, '<br>')
          .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>'),
        year: new Date().getFullYear(),
      });

      const mailOptions = {
        from: this.config.get('MAIL_FROM'),
        to,
        subject,
        text,
        html,
        // Add headers to help with deliverability
        headers: {
          'X-Priority': '3',
          'X-Mailer': 'WECURE System',
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`✓ Email sent to ${to}: ${subject}`);
      return result;
    } catch (error) {
      // Enhanced error logging
      this.logger.error(`✗ Failed to send email to ${to}:`, {
        error: error.message,
        code: error.code,
        responseCode: error.responseCode,
        response: error.response,
      });

      // Re-throw with more context
      throw new InternalServerErrorException(
        `Failed to send email to ${to}: ${error.message}`,
      );
    }
  }

  async sendResetPasswordOtp(email: string, code: string) {
    try {
      const minutes = this.config.get<string>('OTP_EXPIRATION_MINUTES') ?? '15';
      const message = `Your password reset OTP is: <strong>${code}</strong>\n\nIt expires in ${minutes} minutes.`;
      await this.sendEmail(email, 'Your Password Reset OTP', message);
    } catch {
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  async sendEmailVerificationOtp(email: string, code: string) {
    try {
      const minutes = this.config.get<string>('OTP_EXPIRATION_MINUTES') ?? '15';
      const message = `Your verification code is: <strong>${code}</strong>\n\nIt expires in ${minutes} minutes.`;
      await this.sendEmail(email, 'Verify your email', message);
    } catch {
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  async sendDoctorAcceptanceEmail(email: string, name: string) {
    try {
      await this.sendEmail(
        email,
        'Congratulations! Your WeCure Profile is Verified',
        `Dear Dr. ${name},\n\nWe are pleased to inform you that your profile on WeCure has been verified. You can now start setting up your availability and receiving appointments.\n\nWelcome to our community!`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send acceptance email to ${email}: ${err.message}`,
      );
    }
  }

  async sendDoctorRejectionEmail(email: string, name: string, reason?: string) {
    try {
      let message = `Dear Dr. ${name},\n\nThank you for your interest in WeCure. After reviewing your documents, we regret to inform you that we cannot verify your profile at this time.`;
      if (reason) {
        message += `\n\nReason: ${reason}`;
      }
      message += `\n\nIf you believe this is a mistake, please contact our support team.`;

      await this.sendEmail(
        email,
        'Update on your WeCure Registration',
        message,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send rejection email to ${email}: ${err.message}`,
      );
    }
  }

  async sendDoctorSuspensionEmail(
    email: string,
    name: string,
    reason?: string,
  ) {
    try {
      let message = `Dear Dr. ${name},\n\nWe are writing to inform you that your WeCure profile has been suspended. During this time, your profile will not be visible to patients, and your upcoming appointments have been cancelled.`;
      if (reason) {
        message += `\n\nReason: ${reason}`;
      }
      message += `\n\nIf you have any questions, please contact our administration.`;

      await this.sendEmail(
        email,
        'Your WeCure Profile has been Suspended',
        message,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send suspension email to ${email}: ${err.message}`,
      );
    }
  }

  async sendDoctorUnsuspensionEmail(email: string, name: string) {
    try {
      await this.sendEmail(
        email,
        'Your WeCure Profile Suspension has been Lifted',
        `Dear Dr. ${name},\n\nWe are happy to inform you that the suspension on your WeCure profile has been lifted. You can now resume your practice on our platform.\n\nPlease remember to update your availability.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send unsuspension email to ${email}: ${err.message}`,
      );
    }
  }

  async sendAdminCredentials(email: string, name: string, password: string) {
    try {
      const message = `
        Dear ${name},<br><br>
        Your administrator account has been created on WECURE.<br><br>
        <strong>Login Credentials:</strong><br>
        Email: ${email}<br>
        Password: ${password}<br><br>
        Please login and change your password as soon as possible.
      `;
      await this.sendEmail(email, 'Your Admin Credentials', message);
    } catch (err) {
      this.logger.error(
        `Failed to send admin credentials to ${email}: ${err.message}`,
      );
    }
  }

  // Method to close transporter (useful for graceful shutdown)
  async close() {
    if (this.transporter) {
      this.transporter.close();
    }
  }
}
