import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type RefundDocument = Refund & Document;

export enum RefundReason {
  DOCTOR_CANCELLED = 'DOCTOR_CANCELLED',
  PATIENT_CANCELLED = 'PATIENT_CANCELLED',
  ADMIN_REFUND = 'ADMIN_REFUND',
}

export enum RefundStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true })
  paymentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true })
  appointmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId; // Patient receiving refund

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  amount: number; // Refund amount

  @Prop({ required: true })
  originalAmount: number; // Original payment amount

  @Prop({ required: true })
  refundPercentage: number; // Percentage refunded (90 or 100)

  @Prop({ enum: RefundReason, required: true })
  reason: RefundReason;

  @Prop({ unique: true, sparse: true })
  paystackRefundId: string; // Paystack refund reference

  @Prop({ enum: RefundStatus, default: RefundStatus.PENDING })
  status: RefundStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  initiatedBy: Types.ObjectId; // Who initiated the refund

  @Prop()
  processedAt: Date;

  @Prop()
  failureReason: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);

// Performance indexes
RefundSchema.index({ userId: 1, createdAt: -1 }); // User refund history
RefundSchema.index({ appointmentId: 1 }); // Find refund by appointment
RefundSchema.index({ paymentId: 1 }); // Find refund by payment
RefundSchema.index({ status: 1 }); // Filter by status
RefundSchema.index({ doctorId: 1, createdAt: -1 }); // Doctor refund tracking
