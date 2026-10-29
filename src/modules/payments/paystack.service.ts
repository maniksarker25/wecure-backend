import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    if (!this.secretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY is not defined in environment variables',
      );
    }
  }

  async initializeTransaction(email: string, amount: number, metadata: any) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transaction/initialize`,
          {
            email,
            amount: amount * 100, // Convert to kobo/smallest unit
            metadata,
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      this.logger.error(
        'Error initializing Paystack transaction',
        error?.response?.data || error?.message,
      );
      throw new InternalServerErrorException('Payment initialization failed');
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          },
        ),
      );
      const data = response.data.data;

      if (data.status === 'success') {
        this.notificationsService.emit('payment.success', {
          userId: data.metadata?.userId, // Assuming metadata has userId
          amount: data.amount / 100,
          reference: data.reference,
          metadata: data.metadata,
        });
      }

      return data;
    } catch (error: any) {
      this.logger.error(
        `Error verifying Paystack transaction: ${reference}`,
        error?.response?.data || error?.message,
      );
      throw new InternalServerErrorException('Payment verification failed');
    }
  }

  /**
   * Initiate a refund for a transaction
   */
  async initiateRefund(
    reference: string,
    amount?: number,
    merchantNote?: string,
  ) {
    try {
      const payload: any = { transaction: reference };
      if (amount) payload.amount = amount * 100; // Convert to kobo
      if (merchantNote) payload.merchant_note = merchantNote;

      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/refund`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      this.logger.error(
        `Error initiating refund for ${reference}`,
        errorData || error.message,
      );

      const message = errorData?.message || 'Refund initiation failed';
      // Use BadRequestException for better client-side error reporting (e.g., "Cannot refund less than NGN50")
      throw new BadRequestException(`Paystack Error: ${message}`);
    }
  }

  /**
   * Verify refund status
   */
  async verifyRefund(reference: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/refund/${reference}`, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }),
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Error verifying refund: ${reference}`,
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Refund verification failed');
    }
  }

  /**
   * Create a transfer recipient (for doctor payouts)
   */
  async resolveBankAccount(accountNumber: string, bankCode: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/bank/resolve`, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
          params: {
            account_number: accountNumber,
            bank_code: bankCode,
          },
        }),
      );

      return response.data.data;
    } catch (error: any) {
      const paystackMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Bank account verification failed';
      this.logger.error(
        'Error resolving bank account',
        error?.response?.data || error?.message,
      );
      throw new BadRequestException(
        `Bank account verification failed: ${paystackMessage}`,
      );
    }
  }

  /**
   * Create a transfer recipient (for doctor payouts)
   */
  async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string,
  ) {
    try {
      this.logger.debug(
        `Creating transfer recipient: ${JSON.stringify({
          type: 'nuban',
          name,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        })}`,
      );
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transferrecipient`,
          {
            type: 'nuban',
            name,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: 'NGN',
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      const paystackMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Transfer recipient creation failed';
      this.logger.error(
        'Error creating transfer recipient',
        error?.response?.data || error?.message,
      );
      throw new InternalServerErrorException(
        `Transfer recipient creation failed: ${paystackMessage}`,
      );
    }
  }

  /**
   * Initiate a transfer (payout to doctor)
   */
  async initiateTransfer(
    recipientCode: string,
    amount: number,
    reason: string,
    reference: string,
  ) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfer`,
          {
            source: 'balance',
            recipient: recipientCode,
            amount: amount * 100, // Convert to kobo
            reason,
            reference,
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      this.logger.error(
        'Error initiating transfer',
        error?.response?.data || error?.message,
      );
      throw new InternalServerErrorException('Transfer initiation failed');
    }
  }

  /**
   * Verify transfer status
   */
  async verifyTransfer(reference: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/transfer/verify/${reference}`, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }),
      );
      return response.data.data;
    } catch (error: any) {
      this.logger.error(
        `Error verifying transfer: ${reference}`,
        error?.response?.data || error?.message,
      );
      throw new InternalServerErrorException('Transfer verification failed');
    }
  }

  /**
   * List Nigerian banks (helper for getting bank codes)
   */
  async listBanks() {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/bank?currency=NGN`, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }),
      );
      return response.data.data;
    } catch (error: any) {
      this.logger.error(
        'Error fetching banks list',
        error?.response?.data || error?.message,
      );
      throw new InternalServerErrorException('Failed to fetch banks');
    }
  }
}
