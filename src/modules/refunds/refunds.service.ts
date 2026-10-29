import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Refund,
  RefundDocument,
  RefundReason,
  RefundStatus,
} from './schemas/refund.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { PaystackService } from '../payments/paystack.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConfigService } from '@nestjs/config';
import { CreateRefundDto } from './dto/create-refund.dto';
import { RefundFiltersDto } from './dto/refund-filters.dto';
import { Appointment } from '../appointments/schemas/appointment.schema';
import { combineDateAndTime } from 'src/common/utils/business-time.util';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectModel(Refund.name) private refundModel: Model<RefundDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    private readonly paystackService: PaystackService,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Process a full refund (e.g., when a doctor cancels)
   */
  async processFullRefund(
    appointmentId: string,
    appointment: Appointment,
    initiatedBy: string,
  ): Promise<Refund | null> {
    // 1. Try to find by paymentId if available on appointment
    let payment: PaymentDocument | null = null;
    if (appointment.paymentId) {
      payment = await this.paymentModel.findById(appointment.paymentId).exec();
    }

    // 2. Fallback to querying by appointmentId
    if (!payment) {
      payment = await this.paymentModel
        .findOne({ appointmentId: new Types.ObjectId(appointmentId) })
        .exec();
    }

    if (!payment) {
      this.logger.warn(`No payment found for appointment ${appointmentId}`);
      return null;
    }

    if (payment.isRefunded) {
      throw new BadRequestException('Payment already refunded');
    }

    const dto = new CreateRefundDto();
    dto.paymentId = payment._id.toString();
    dto.appointmentId = appointmentId; // Keeping as string, manual conversion handled if needed or rely on validation
    dto.userId = appointment.userId.toString();
    dto.doctorId = appointment.doctorId.toString();
    dto.originalAmount = payment.amount;
    dto.amount = payment.amount; // 100% refund
    dto.refundPercentage = 100;
    dto.reason = RefundReason.DOCTOR_CANCELLED;
    dto.initiatedBy = initiatedBy;

    return this.initiateRefund(dto, payment.paystackReference);
  }

  /**
   * Process a partial refund (e.g., when a patient cancels)
   */
  async processPartialRefund(
    appointmentId: string,
    appointment: Appointment,
    initiatedBy: string,
  ): Promise<Refund | null> {
    // 1. Try to find by paymentId if available on appointment
    let payment: PaymentDocument | null = null;
    if (appointment.paymentId) {
      payment = await this.paymentModel.findById(appointment.paymentId).exec();
    }

    // 2. Fallback to querying by appointmentId
    if (!payment) {
      payment = await this.paymentModel
        .findOne({ appointmentId: new Types.ObjectId(appointmentId) })
        .exec();
    }

    if (!payment) {
      this.logger.warn(`No payment found for appointment ${appointmentId}`);
      return null;
    }

    if (payment.isRefunded) {
      throw new BadRequestException('Payment already refunded');
    }

    const refundAmount = this.calculateRefundAmount(appointment, new Date());

    if (refundAmount <= 0) {
      this.logger.log(
        `Refund amount calculated to 0 for appointment ${appointmentId}. No refund processed.`,
      );
      return null;
    }

    const refundPercentage = (refundAmount / payment.amount) * 100;

    const dto = new CreateRefundDto();
    dto.paymentId = payment._id.toString();
    dto.appointmentId = appointmentId;
    dto.userId = appointment.userId.toString();
    dto.doctorId = appointment.doctorId.toString();
    dto.originalAmount = payment.amount;
    dto.amount = refundAmount;
    dto.refundPercentage = Math.round(refundPercentage); // Store as integer if possible
    dto.reason = RefundReason.PATIENT_CANCELLED;
    dto.initiatedBy = initiatedBy;

    return this.initiateRefund(dto, payment.paystackReference);
  }

  /**
   * Calculate refund amount based on policy
   */
  calculateRefundAmount(
    appointment: Appointment,
    cancellationTime: Date,
  ): number {
    // Determine appointment start time (in the business timezone, not the host's)
    const appointmentStart = combineDateAndTime(
      appointment.appointmentDate,
      appointment.appointmentTime,
    );

    // Policy:
    // - Before appointment startTime: 90% refund (10% fee)
    // - After appointment startTime: 0% refund

    // Default fees from env or fallback
    const refundPercent = parseInt(
      this.configService.get<string>('PATIENT_CANCELLATION_REFUND_PERCENT') ||
        '90',
    );

    if (cancellationTime < appointmentStart) {
      const amount = (appointment.consultationFee * refundPercent) / 100;
      return Math.floor(amount * 100) / 100; // Round to 2 decimal places
    }

    return 0;
  }

  /**
   * Initiate refund process
   */
  async initiateRefund(
    dto: CreateRefundDto,
    paystackReference: string,
  ): Promise<Refund> {
    // 1. Create Refund Record (Pending)
    const refund = new this.refundModel({
      ...dto,
      paymentId: new Types.ObjectId(dto.paymentId),
      appointmentId: new Types.ObjectId(dto.appointmentId),
      userId: new Types.ObjectId(dto.userId),
      doctorId: new Types.ObjectId(dto.doctorId),
      initiatedBy: new Types.ObjectId(dto.initiatedBy),
      status: RefundStatus.PENDING,
    });
    await refund.save();

    try {
      // 2. Call Paystack Refund API
      // Note: Amount passed to Paystack likely needs to be in kobo if consistent with other Paystack APIs?
      // Checking paystack.service logic: yes, initiateRefund converts to kobo * 100 inside the service.
      const paystackResponse = await this.paystackService.initiateRefund(
        paystackReference,
        dto.amount,
        dto.reason,
      );

      // 3. Update Refund Record
      refund.paystackRefundId = String(
        paystackResponse.id || paystackResponse.reference,
      ); // Use whatever ID Paystack returns, often 'id' for refund object
      // Paystack refund response typically contains an ID. Let's assume ID or reference.
      refund.status = RefundStatus.PROCESSING; // Refunds are often async
      refund.processedAt = new Date();
      refund.metadata = paystackResponse;
      await refund.save();

      // 4. Update Payment Record
      await this.paymentModel.findByIdAndUpdate(dto.paymentId, {
        isRefunded: true,
        refundId: refund._id,
        refundedAmount: dto.amount,
        refundedAt: new Date(),
        status: 'REFUNDED', // Or keep as PAID but mark refunded? Schema has status enum ['PENDING', 'PAID', 'FAILED']. Let's stick to existing or update schema if needed.
        // Existing schema had limited statuses. I might want to add 'REFUNDED' or 'PARTIALLY_REFUNDED'.
        // For now, let's keep status 'PAID' (as the original transaction was paid) but use the flags isRefunded.
      });

      // 5. Create Audit Log
      await this.auditLogsService.create({
        userId: dto.initiatedBy,
        action: 'REFUND_INITIATED',
        resource: 'Refund',
        resourceId: refund._id.toString(),
        metadata: {
          // Assuming metadata accepts Object now or I cast it
          amount: dto.amount,
          reason: dto.reason,
          appointmentId: dto.appointmentId,
        } as any,
      });

      return refund;
    } catch (error) {
      this.logger.error(
        `Refund initiation failed for payment ${paystackReference}`,
        error,
      );
      refund.status = RefundStatus.FAILED;
      refund.failureReason = error.response?.message || error.message;
      await refund.save();

      // If it's already an HttpException (like BadRequestException from PaystackService), re-throw it
      if (error.status && error.response) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to initiate refund');
    }
  }

  async getRefunds(filters: RefundFiltersDto) {
    const query: any = {};
    if (filters.userId) query.userId = new Types.ObjectId(filters.userId);
    if (filters.doctorId) query.doctorId = new Types.ObjectId(filters.doctorId);
    if (filters.status) query.status = filters.status;

    // Date range logic
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.refundModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.refundModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getRefundById(id: string): Promise<Refund> {
    const refund = await this.refundModel.findById(id).exec();
    if (!refund) {
      throw new NotFoundException('Refund not found');
    }
    return refund;
  }

  async handleRefundWebhook(payload: any) {
    this.logger.log(`Handling refund webhook: ${payload.id}`);

    // Look up refund by Paystack refund ID
    const refund = await this.refundModel
      .findOne({
        paystackRefundId: String(payload.id),
      })
      .exec();

    if (!refund) {
      this.logger.warn(
        `Refund record not found for Paystack refund ID: ${payload.id}`,
      );
      return;
    }

    // Update status if it's processed
    if (payload.status === 'processed') {
      refund.status = RefundStatus.COMPLETED;
      refund.processedAt = new Date();
      refund.metadata = { ...refund.metadata, webhookData: payload };
      await refund.save();

      this.logger.log(`Refund ${refund._id} marked as COMPLETED`);

      // Log Audit
      await this.auditLogsService.create({
        userId: refund.initiatedBy.toString(),
        action: 'REFUND_COMPLETED',
        resource: 'Refund',
        resourceId: refund._id.toString(),
        metadata: { paystackRefundId: payload.id },
      });
    } else if (payload.status === 'failed') {
      refund.status = RefundStatus.FAILED;
      refund.failureReason = 'Refund failed at Paystack';
      await refund.save();

      this.logger.error(`Refund ${refund._id} marked as FAILED via webhook`);
    }
  }
}
