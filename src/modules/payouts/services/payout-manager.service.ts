import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Payout, PayoutDocument, PayoutStatus } from '../schemas/payout.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../appointments/schemas/appointment.schema';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { PaystackService } from '../../payments/paystack.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PayoutHelperService } from '../helpers/payout.helper';

@Injectable()
export class PayoutManagerService {
  private readonly logger = new Logger(PayoutManagerService.name);

  constructor(
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private readonly paystackService: PaystackService,
    private readonly auditLogsService: AuditLogsService,
    private readonly payoutHelper: PayoutHelperService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create payout batch for ALL eligible doctors (Monthly Scheduler)
   */
  async createPayoutBatch(batchId: string) {
    this.logger.log(`Starting payout batch ${batchId}`);

    const results = await this.appointmentModel.aggregate(
      this.payoutHelper.getPendingEarningsAggregation(),
    );
    this.logger.log(`Found ${results.length} doctors eligible for payout`);

    const payouts: Payout[] = [];

    for (const result of results) {
      const doctorId = result._id;
      let payoutId: Types.ObjectId | null = null;
      let appointmentIds: Types.ObjectId[] = [];

      try {
        const { platformCommission, payoutAmount } =
          this.payoutHelper.calculatePayoutAmount(result.totalEarnings);

        // Ensure Recipient
        const recipientCode = await this.ensureTransferRecipient(
          doctorId.toString(),
        );

        if (!recipientCode) {
          this.logger.warn(
            `Skipping payout for doctor ${doctorId}: No valid bank details/recipient`,
          );
          continue;
        }

        payoutId = new Types.ObjectId();
        appointmentIds = result.appointmentIds;

        const lockResult = await this.appointmentModel.updateMany(
          {
            _id: { $in: appointmentIds },
            isPaidOut: false,
            payoutId: { $exists: false },
          },
          { payoutId },
        );

        if (lockResult.modifiedCount !== appointmentIds.length) {
          await this.appointmentModel.updateMany(
            { _id: { $in: appointmentIds }, payoutId },
            { $unset: { payoutId: '' } },
          );
          this.logger.warn(
            `Skipping payout for doctor ${doctorId}: appointments changed during payout locking`,
          );
          continue;
        }

        const payout = new this.payoutModel({
          _id: payoutId,
          doctorId: doctorId,
          batchId,
          appointmentIds,
          totalEarnings: result.totalEarnings,
          platformCommission,
          payoutAmount,
          transferRecipientCode: recipientCode,
          status: PayoutStatus.PENDING,
          scheduledFor: new Date(),
        });

        await payout.save();
        payouts.push(payout);
      } catch (error) {
        if (payoutId && appointmentIds.length > 0) {
          await this.appointmentModel.updateMany(
            { _id: { $in: appointmentIds }, payoutId },
            { $unset: { payoutId: '' } },
          );
        }

        this.logger.error(
          `Error creating payout for doctor ${doctorId}`,
          error,
        );
      }
    }

    return payouts;
  }

  /**
   * Process a payout (Initiate Transfer)
   */
  async processPayout(payoutId: string) {
    const existingPayout = await this.payoutModel.findById(payoutId);
    if (!existingPayout) throw new NotFoundException('Payout not found');

    if (
      existingPayout.status !== PayoutStatus.PENDING &&
      existingPayout.status !== PayoutStatus.FAILED
    ) {
      throw new BadRequestException(
        `Payout is already ${existingPayout.status}`,
      );
    }

    const reference =
      existingPayout.paystackTransferId || this.buildTransferReference(payoutId);

    const payout = await this.payoutModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(payoutId),
        status: { $in: [PayoutStatus.PENDING, PayoutStatus.FAILED] },
      },
      {
        status: PayoutStatus.PROCESSING,
        paystackTransferId: reference,
        failureReason: undefined,
      },
      { new: true },
    );

    if (!payout) {
      throw new BadRequestException('Payout is already being processed');
    }

    try {
      const transfer = await this.paystackService.initiateTransfer(
        payout.transferRecipientCode,
        payout.payoutAmount,
        `Payout Batch ${payout.batchId}`,
        reference,
      );

      payout.paystackTransferId = transfer.reference || reference;
      payout.processedAt = new Date();
      payout.metadata = transfer;

      await payout.save();
      return payout;
    } catch (error) {
      payout.status = PayoutStatus.FAILED;
      payout.failureReason = error.message;
      payout.retryCount = (payout.retryCount || 0) + 1;
      await payout.save();
      this.logger.error(`Payout processing failed for ${payoutId}`, error);
      return payout;
    }
  }

  async processDuePayouts(limit = 25) {
    const maxRetries = this.configService.get<number>('PAYOUT_MAX_RETRIES', 3);
    const duePayouts = await this.payoutModel
      .find({
        status: { $in: [PayoutStatus.PENDING, PayoutStatus.FAILED] },
        scheduledFor: { $lte: new Date() },
        retryCount: { $lt: maxRetries },
      })
      .sort({ scheduledFor: 1, createdAt: 1 })
      .limit(limit)
      .select('_id')
      .lean();

    const results: Array<{
      payoutId: string;
      status: PayoutStatus | 'ERROR';
      error?: string;
    }> = [];

    for (const payout of duePayouts) {
      const payoutId = payout._id.toString();

      try {
        const processed = await this.processPayout(payoutId);
        results.push({ payoutId, status: processed.status });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown payout error';
        this.logger.error(`Failed to process due payout ${payoutId}`, error);
        results.push({ payoutId, status: 'ERROR', error: message });
      }
    }

    return {
      attempted: results.length,
      results,
    };
  }

  /**
   * Ensure Doctor has a Paystack Transfer Recipient
   */
  async ensureTransferRecipient(doctorDocId: string): Promise<string | null> {
    const doctor = await this.doctorModel.findById(doctorDocId);
    if (!doctor) return null;

    if (doctor.paystackRecipientCode) {
      return doctor.paystackRecipientCode;
    }

    const { bankName, bankCode, accountName, accountNumber } =
      this.payoutHelper.decryptBankDetails(doctor);

    if (!accountNumber || !accountName || (!bankName && !bankCode)) {
      return null;
    }

    let resolvedBankCode = bankCode;

    if (!resolvedBankCode && bankName) {
      const banks = await this.paystackService.listBanks();
      const bank = banks.find(
        (b) =>
          b.name.toLowerCase() === bankName.toLowerCase() ||
          b.slug.toLowerCase() === bankName.toLowerCase(),
      );

      if (!bank) {
        this.logger.warn(
          `Bank not found for doctor ${doctorDocId}: ${bankName}`,
        );
        return null;
      }

      resolvedBankCode = bank.code;
    }

    if (!resolvedBankCode) {
      this.logger.warn(
        `Bank code not found for doctor ${doctorDocId}: ${bankName || 'unknown bank'}`,
      );
      return null;
    }

    try {
      const recipient = await this.paystackService.createTransferRecipient(
        accountName,
        accountNumber,
        resolvedBankCode,
      );

      doctor.paystackRecipientCode = recipient.recipient_code;
      doctor.recipientCreatedAt = new Date();
      await doctor.save();

      return recipient.recipient_code;
    } catch (e) {
      this.logger.error(
        `Failed to create recipient for doctor ${doctorDocId}`,
        e,
      );
      return null;
    }
  }

  /**
   * Complete payout from Paystack Webhook
   */
  async completePayoutFromWebhook(transferCode: string) {
    const payout = await this.payoutModel.findOne({
      paystackTransferId: transferCode,
    });
    if (!payout) return;

    if (payout.status === PayoutStatus.COMPLETED) return;

    payout.status = PayoutStatus.COMPLETED;
    await payout.save();

    const appointments = await this.appointmentModel
      .find({
        _id: { $in: payout.appointmentIds },
        payoutId: payout._id,
      })
      .select('_id consultationFee')
      .lean();

    const payoutRatio =
      payout.totalEarnings > 0 ? payout.payoutAmount / payout.totalEarnings : 0;

    if (appointments.length > 0) {
      await this.appointmentModel.bulkWrite(
        appointments.map((appointment) => ({
          updateOne: {
            filter: { _id: appointment._id, isPaidOut: false },
            update: {
              isPaidOut: true,
              paidOutAt: new Date(),
              payoutAmount: Number(
                (appointment.consultationFee * payoutRatio).toFixed(2),
              ),
            },
          },
        })),
      );
    } else {
      this.logger.warn(
        `Payout ${payout._id} completed but no linked appointments were found`,
      );
    }

    // Mark any locked appointments defensively if the query above missed fields.
    await this.appointmentModel.updateMany(
      { _id: { $in: payout.appointmentIds } },
      {
        isPaidOut: true,
        paidOutAt: new Date(),
      },
    );

    // Update doctor stats
    await this.doctorModel.findByIdAndUpdate(payout.doctorId, {
      $inc: {
        totalPayouts: payout.payoutAmount,
      },
    });

    await this.auditLogsService.create({
      userId: payout.doctorId.toString(),
      action: 'PAYOUT_COMPLETED',
      resource: 'Payout',
      resourceId: payout._id.toString(),
      metadata: {
        amount: payout.payoutAmount,
        transferReference: transferCode,
        batchId: payout.batchId,
      },
    });
  }

  async failPayoutFromWebhook(
    transferCode: string,
    reason?: string,
    metadata?: Record<string, any>,
  ) {
    const payout = await this.payoutModel.findOne({
      paystackTransferId: transferCode,
    });

    if (!payout) {
      this.logger.warn(
        `Received transfer failure for unknown payout reference ${transferCode}`,
      );
      return;
    }

    if (payout.status === PayoutStatus.COMPLETED) {
      this.logger.warn(
        `Ignoring transfer failure for already completed payout ${payout._id}`,
      );
      return;
    }

    payout.status = PayoutStatus.FAILED;
    payout.failureReason = reason || 'Transfer failed';
    payout.retryCount = (payout.retryCount || 0) + 1;
    payout.metadata = {
      ...(payout.metadata || {}),
      failureWebhook: metadata,
    };
    await payout.save();

    await this.auditLogsService.create({
      userId: payout.doctorId.toString(),
      action: 'PAYOUT_FAILED',
      resource: 'Payout',
      resourceId: payout._id.toString(),
      metadata: {
        reason: payout.failureReason,
        transferReference: transferCode,
        batchId: payout.batchId,
      },
    });
  }

  private buildTransferReference(payoutId: string) {
    return `payout_${payoutId}`;
  }
}
