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

  // @Post('webhook/paystack')
  // @HttpCode(HttpStatus.OK)
  // async handleWebhook(
  //   @Headers('x-paystack-signature') signature: string,
  //   @Body() body: any,
  //   @Req() req: any,
  // ) {
  //   this.logger.log('Incoming Paystack Webhook');
  //   this.logger.debug(`Signature: ${signature}`);

  //   const webhookSecret =
  //     this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET') ||
  //     this.configService.get<string>('PAYSTACK_SECRET_KEY') ||
  //     '';

  //   if (!webhookSecret) {
  //     this.logger.error('PAYSTACK_WEBHOOK_SECRET is not configured');
  //     throw new ForbiddenException('Webhook secret not configured');
  //   }

  //   const raw =
  //     req && req.body && Buffer.isBuffer(req.body)
  //       ? req.body
  //       : (req && req.rawBody) || JSON.stringify(body);

  //   const computedHash = crypto
  //     .createHmac('sha512', webhookSecret)
  //     .update(raw)
  //     .digest('hex');

  //   try {
  //     const sigBuf = Buffer.from(signature, 'hex');
  //     const compBuf = Buffer.from(computedHash, 'hex');
  //     if (
  //       sigBuf.length !== compBuf.length ||
  //       !crypto.timingSafeEqual(sigBuf, compBuf)
  //     ) {
  //       this.logger.error(
  //         'Invalid Paystack webhook signature (timing-safe check failed)',
  //       );
  //       throw new ForbiddenException('Invalid signature');
  //     }
  //   } catch (e) {
  //     if (computedHash !== signature) {
  //       this.logger.error('Invalid Paystack signature');
  //       this.logger.error(`Calculated Hash: ${computedHash}`);
  //       this.logger.error(`Expected Signature: ${signature}`);
  //       throw new ForbiddenException('Invalid signature');
  //     }
  //   }

  //   this.logger.log(`Handling Paystack event: ${body.event}`);
  //   console.log('Webhook payload:', body.en); // Consider removing or reducing in production

  //   if (body.event === 'charge.success') {
  //     const { reference, metadata } = body.data;
  //     this.logger.log(`Processing charge.success for reference: ${reference}`);

  //     let verified: any = null;
  //     try {
  //       verified = await this.paystackService.verifyTransaction(reference);
  //     } catch (err: any) {
  //       this.logger.error(
  //         `Paystack verifyTransaction failed for ${reference}: ${err.message}`,
  //       );
  //     }

  //     // Ensure verified status is success before proceeding
  //     if (!verified || verified.status !== 'success') {
  //       this.logger.error(
  //         `Paystack verification failed or returned non-success for ${reference}`,
  //       );
  //       return { status: 'ignored' };
  //     }

  //     // Idempotency check handled by checking current status

  //     // metadata logged via structured audit logs where needed

  //     if (metadata?.type === 'APPOINTMENT') {
  //       const payment = await this.paymentsService.findByReference(reference);
  //       if (payment && payment.status !== 'PAID') {
  //         // Update Payment
  //         await this.paymentsService.updateStatus(reference, 'PAID');

  //         // Update Appointment
  //         if (metadata.appointmentId) {
  //           // We need payment._id to link to appointment
  //           // payment object from findByReference has _id
  //           await this.appointmentManagerService.markAsPaid(
  //             metadata.appointmentId,
  //             payment._id.toString(),
  //           );
  //         }

  //         // Log Audit
  //         await this.auditLogsService.create({
  //           userId: metadata.userId,
  //           action: 'PAYMENT_SUCCESS',
  //           resource: 'Appointment',
  //           resourceId: metadata.appointmentId,
  //           ipAddress: body.data.ip_address,
  //         });
  //       }
  //     } else if (metadata?.type === 'DONATION') {
  //       const donation = await this.donationsService.findByReference(reference);
  //       if (donation && donation.status !== 'PAID') {
  //         // Update Donation
  //         donation.status = 'PAID';
  //         await donation.save();

  //         // Log Audit
  //         await this.auditLogsService.create({
  //           userId: metadata.userId || 'ANONYMOUS',
  //           action: 'DONATION_SUCCESS',
  //           resource: 'Donation',
  //           resourceId: donation._id.toString(),
  //           ipAddress: body.data.ip_address,
  //         });
  //       }
  //     }
  //   } else if (body.event === 'transfer.success') {
  //     const { reference } = body.data; // paystackTransferId
  //     await this.payoutManagerService.completePayoutFromWebhook(reference);
  //   } else if (body.event === 'transfer.failed') {
  //     // Handle transfer failure? PayoutsService didn't implement explicit failure handler but we can log
  //     this.logger.error(
  //       `Transfer failed for reference ${body.data.reference}: ${body.data.reason}`,
  //     );
  //     // Ideally update payout status to FAILED.
  //     // I should expose a method in PayoutsService for this. for now just log.
  //   } else if (body.event === 'refund.processed') {
  //     // Refund successful
  //     await this.refundsService.handleRefundWebhook(body.data);
  //   }

  //   return { status: 'success' };
  // }

  @Post('webhook/paystack')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    this.logger.log('Incoming Paystack Webhook');
    this.logger.debug(`Signature: ${signature}`);

    const webhookSecret =
      this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET') ||
      this.configService.get<string>('PAYSTACK_SECRET_KEY') ||
      '';

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

    if (computedHash !== signature) {
      this.logger.error('Invalid Paystack signature');
      this.logger.debug(`Expected: ${computedHash}`);
      this.logger.debug(`Received: ${signature}`);
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

          if (payment && payment.status !== 'PAID') {
            await this.paymentsService.updateStatus(reference, 'PAID');

            if (metadata.appointmentId) {
              await this.appointmentManagerService.markAsPaid(
                metadata.appointmentId,
                payment._id.toString(),
              );
            }

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
