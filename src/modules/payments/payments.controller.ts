import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AppointmentFinderService } from '../appointments/services/appointment-finder.service';
import { AppointmentManagerService } from '../appointments/services/appointment-manager.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DonationsService } from '../donations/donations.service';
import { PayoutManagerService } from '../payouts/services/payout-manager.service';
import { RefundsService } from '../refunds/refunds.service';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paystackService: PaystackService,
    private readonly appointmentFinderService: AppointmentFinderService,
    private readonly appointmentManagerService: AppointmentManagerService,
    private readonly donationsService: DonationsService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly payoutManagerService: PayoutManagerService,
    private readonly refundsService: RefundsService,
  ) {}

  @Post('appointments/:appointmentId/initialize')
  @UseGuards(JwtAuthGuard)
  async initializeAppointmentPayment(
    @Param('appointmentId') appointmentId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    // 1. Get Appointment
    const appointment =
      await this.appointmentFinderService.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // 2. Ensure caller is patient
    if (appointment.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only pay for your own appointments',
      );
    }

    // 3. Ensure status is PENDING
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Appointment is not in PENDING status');
    }

    // 4. Ensure not already paid
    if (appointment.paymentId) {
      throw new BadRequestException('Appointment is already paid');
    }

    // 5. Get fee
    const amount = appointment.consultationFee;
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid consultation fee');
    }

    // 6. Call Paystack
    const metadata = {
      type: 'APPOINTMENT',
      appointmentId,
      userId,
      doctorId: appointment.doctorId.toString(),
    };

    const paymentData = await this.paystackService.initializeTransaction(
      req.user.email,
      amount,
      metadata,
    );

    // Create a pending payment record
    await this.paymentsService.create({
      appointmentId,
      userId,
      paystackReference: paymentData.reference,
      amount,
      currency: 'NGN', // Configurable, but defaulting to NGN as per schema default
      status: 'PENDING',
    });

    return {
      authorization_url: paymentData.authorization_url,
      reference: paymentData.reference,
    };
  }

  @Post('donations/initialize')
  async initializeDonation(
    @Body() body: { email: string; amount: number; userId?: string },
  ) {
    if (!body.email || !body.amount) {
      throw new BadRequestException('Email and amount are required');
    }

    const metadata = {
      type: 'DONATION',
      userId: body.userId, // Optional
    };

    const paymentData = await this.paystackService.initializeTransaction(
      body.email,
      body.amount,
      metadata,
    );

    // Create donation record
    await this.donationsService.create({
      userId: body.userId,
      paystackReference: paymentData.reference,
      amount: body.amount,
      currency: 'NGN',
      status: 'PENDING',
    } as any);

    return {
      authorization_url: paymentData.authorization_url,
      reference: paymentData.reference,
    };
  }

  @Post('webhook/paystack')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    this.logger.log('Incoming Paystack Webhook');
    this.logger.debug(`Signature: ${signature}`);

    // Paystack signs webhook bodies with the secret key, not a separate whsec value.
    const webhookSecret =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';

    if (!webhookSecret) {
      this.logger.error('Paystack webhook secret not configured');
      throw new ForbiddenException('Webhook secret missing');
    }

    // -------------------------------
    // 1. Get RAW BODY (IMPORTANT)
    // -------------------------------
    const rawBody = req.rawBody;

    if (!rawBody) {
      this.logger.error('Raw body not found in request');
      throw new ForbiddenException('Invalid webhook request');
    }

    // -------------------------------
    // 2. Verify Paystack Signature
    // -------------------------------
    const computedHash = crypto
      .createHmac('sha512', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const computedBuf = Buffer.from(computedHash, 'hex');
    const signatureBuf = Buffer.from(signature || '', 'hex');
    const signatureMatches =
      computedBuf.length === signatureBuf.length &&
      crypto.timingSafeEqual(computedBuf, signatureBuf);

    if (!signatureMatches) {
      this.logger.error('Invalid Paystack signature');
      throw new ForbiddenException('Invalid signature');
    }

    // -------------------------------
    // 3. Body is already parsed JSON
    // -------------------------------
    this.logger.log(`Handling Paystack event: ${body?.event}`);

    if (!body?.event) {
      this.logger.error('Missing event in webhook payload');
      return { status: 'ignored' };
    }

    // -------------------------------
    // 4. Handle Events
    // -------------------------------
    switch (body.event) {
      case 'charge.success': {
        const { reference, metadata } = body.data;

        this.logger.log(`Charge success: ${reference}`);

        let verified: any = null;
        try {
          verified = await this.paystackService.verifyTransaction(reference);
        } catch (error) {
          this.logger.warn(
            `Paystack verification failed for ${reference}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { status: 'ignored' };
        }

        if (!verified || verified.status !== 'success') {
          this.logger.warn(`Transaction not verified: ${reference}`);
          return { status: 'ignored' };
        }

        if (metadata?.type === 'APPOINTMENT') {
          const payment = await this.paymentsService.findByReference(reference);

          if (!payment) {
            this.logger.error(
              `Paid Paystack reference ${reference} has no local payment record`,
            );
            break;
          }

          const wasUnpaid = payment.status !== 'PAID';
          if (wasUnpaid) {
            await this.paymentsService.updateStatus(reference, 'PAID');
          }

          if (metadata.appointmentId && !payment.isRefunded) {
            await this.appointmentManagerService.settleSuccessfulPayment(
              metadata.appointmentId,
              payment._id.toString(),
              metadata.userId,
              metadata.doctorId,
            );
          }

          if (wasUnpaid) {
            await this.auditLogsService.create({
              userId: metadata.userId,
              action: 'PAYMENT_SUCCESS',
              resource: 'Appointment',
              resourceId: metadata.appointmentId,
              ipAddress: body.data?.ip_address,
            });
          }
        } else if (metadata?.type === 'DONATION') {
          const donation =
            await this.donationsService.findByReference(reference);

          if (donation && donation.status !== 'PAID') {
            donation.status = 'PAID';
            await donation.save();

            await this.auditLogsService.create({
              userId: metadata.userId || 'ANONYMOUS',
              action: 'DONATION_SUCCESS',
              resource: 'Donation',
              resourceId: donation._id.toString(),
              ipAddress: body.data?.ip_address,
            });
          }
        }

        break;
      }

      case 'transfer.success': {
        const { reference } = body.data;
        await this.payoutManagerService.completePayoutFromWebhook(reference);
        break;
      }

      case 'transfer.failed': {
        this.logger.error(
          `Transfer failed: ${body.data?.reference} - ${body.data?.reason}`,
        );
        await this.payoutManagerService.failPayoutFromWebhook(
          body.data?.reference,
          body.data?.reason,
          body.data,
        );
        break;
      }

      case 'refund.processed': {
        await this.refundsService.handleRefundWebhook(body.data);
        break;
      }

      default:
        this.logger.warn(`Unhandled event type: ${body.event}`);
    }

    return { status: 'success' };
  }
}
