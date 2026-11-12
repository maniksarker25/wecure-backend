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
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Role } from '../../../common/enum/role.enum';
import { UserStatus } from '../../../common/enum/user.status.enum';
import { NotificationType } from '../../../common/enum/notification-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class PayoutManagerService {
  private readonly logger = new Logger(PayoutManagerService.name);

  constructor(
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly paystackService: PaystackService,
    private readonly auditLogsService: AuditLogsService,
    private readonly payoutHelper: PayoutHelperService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
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
          await this.notifyBankDetailsRequired(doctorId, batchId);
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
      existingPayout.paystackTransferId ||
      this.buildTransferReference(payoutId);

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
      const previousRetryCount = payout.retryCount || 0;
      payout.status = PayoutStatus.FAILED;
      payout.failureReason = error.message;
      payout.retryCount = previousRetryCount + 1;
      await payout.save();
      this.logger.error(`Payout processing failed for ${payoutId}`, error);
      await this.notifyTransferFailure(payout, previousRetryCount);
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

  private async notifyBankDetailsRequired(
    doctorId: Types.ObjectId,
    batchId: string,
  ) {
    await this.notifyPayoutIssue({
      doctorId,
      type: NotificationType.PAYOUT_BANK_DETAILS_REQUIRED,
      title: 'Update your payout bank details',
      doctorMessage:
        'We could not prepare your payout because your bank details are missing or could not be verified. Please update your bank details in the app or contact support. Your eligible earnings remain unpaid.',
      adminMessage: `Payout batch ${batchId} was skipped because this doctor's bank details or Paystack recipient could not be verified.`,
      data: { batchId, issue: 'BANK_DETAILS_OR_RECIPIENT_INVALID' },
      dedupePrefix: `payout-bank-details:${doctorId}:${batchId}`,
    });
  }

  private async notifyTransferFailure(
    payout: PayoutDocument,
    previousRetryCount: number,
  ) {
    const maxRetries = this.configService.get<number>('PAYOUT_MAX_RETRIES', 3);
    const isFirstFailure = previousRetryCount === 0;
    const retriesExhausted = payout.retryCount >= maxRetries;

    if (!isFirstFailure && !retriesExhausted) return;

    await this.notifyPayoutIssue({
      doctorId: payout.doctorId,
      type: NotificationType.PAYOUT_FAILED,
      title: retriesExhausted
        ? 'Payout needs attention'
        : 'Payout transfer failed',
      doctorMessage:
        'We could not complete your payout transfer. Please verify your bank details in the app or contact support. The system will retry automatically when retries remain.',
      adminMessage: retriesExhausted
        ? `Payout ${payout._id} for batch ${payout.batchId} has exhausted its automatic retries and needs manual attention. Reason: ${payout.failureReason || 'Transfer failed'}.`
        : `Payout ${payout._id} for batch ${payout.batchId} failed and will be retried automatically when retries remain. Reason: ${payout.failureReason || 'Transfer failed'}.`,
      data: {
        payoutId: payout._id.toString(),
        batchId: payout.batchId,
        retryCount: payout.retryCount,
        retriesExhausted,
      },
      dedupePrefix: `payout-transfer-failure:${payout._id}:${retriesExhausted ? 'exhausted' : 'first'}`,
      notifyDoctor: isFirstFailure,
      notifyAdmins: isFirstFailure || retriesExhausted,
    });
  }

  private async notifyPayoutIssue(options: {
    doctorId: Types.ObjectId;
    type: NotificationType;
    title: string;
    doctorMessage: string;
    adminMessage: string;
    data: Record<string, any>;
    dedupePrefix: string;
    notifyDoctor?: boolean;
    notifyAdmins?: boolean;
  }) {
    const {
      doctorId,
      type,
      title,
      doctorMessage,
      adminMessage,
      data,
      dedupePrefix,
      notifyDoctor = true,
      notifyAdmins = true,
    } = options;
    const recipients: Array<{ userId: Types.ObjectId; isDoctor: boolean }> = [];

    if (notifyDoctor) {
      try {
        const doctor = await this.doctorModel
          .findById(doctorId)
          .select('userId')
          .lean();
        if (doctor?.userId) {
          recipients.push({
            userId: new Types.ObjectId(doctor.userId as Types.ObjectId),
            isDoctor: true,
          });
        } else {
          this.logger.warn(
            `Cannot notify doctor ${doctorId}: linked user was not found`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to resolve notification recipient for doctor ${doctorId}`,
          error,
        );
      }
    }

    if (notifyAdmins) {
      try {
        const admins = await this.userModel
          .find({
            role: { $in: [Role.ADMIN, Role.SUPER_ADMIN] },
            status: UserStatus.ACTIVE,
          })
          .select('_id')
          .lean();
        if (admins.length === 0) {
          this.logger.warn(
            'No active admin users found for payout notification',
          );
        }
        recipients.push(
          ...admins.map((admin) => ({
            userId: new Types.ObjectId(admin._id),
            isDoctor: false,
          })),
        );
      } catch (error) {
        this.logger.error(
          'Failed to resolve payout admin notification recipients',
          error,
        );
      }
    }

    try {
      await Promise.all(
        recipients.map(({ userId, isDoctor }) =>
          this.notificationsService.createInAppNotificationOnce(
            userId,
            type,
            title,
            isDoctor ? doctorMessage : adminMessage,
            {
              ...data,
              doctorId: doctorId.toString(),
              audience: isDoctor ? 'DOCTOR' : 'ADMIN',
            },
            `${dedupePrefix}:${userId.toString()}`,
          ),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist payout notifications for doctor ${doctorId}`,
        error,
      );
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

    if (payout.status === PayoutStatus.FAILED) {
      this.logger.log(
        `Ignoring duplicate transfer failure for payout ${payout._id}`,
      );
      return;
    }

    const previousRetryCount = payout.retryCount || 0;
    payout.status = PayoutStatus.FAILED;
    payout.failureReason = reason || 'Transfer failed';
    payout.retryCount = previousRetryCount + 1;
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
    await this.notifyTransferFailure(payout, previousRetryCount);
  }

  private buildTransferReference(payoutId: string) {
    return `payout_${payoutId}`;
  }
}
