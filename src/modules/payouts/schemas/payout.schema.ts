import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type PayoutDocument = Payout & Document;

export enum PayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class Payout {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  batchId: string; // Groups payouts in same batch (e.g., "2026-02")

  @Prop({ type: [Types.ObjectId], ref: 'Appointment', required: true })
  appointmentIds: Types.ObjectId[]; // Appointments included in this payout

  @Prop({ required: true })
  totalEarnings: number; // Total from appointments (100%)

  @Prop({ required: true })
  platformCommission: number; // 10% commission

  @Prop({ required: true })
  payoutAmount: number; // 90% to doctor

  @Prop()
  transferRecipientCode: string; // Paystack recipient code

  @Prop({ unique: true, sparse: true })
  paystackTransferId: string; // Paystack transfer reference

  @Prop({ enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Prop()
  scheduledFor: Date; // When payout should be processed

  @Prop()
  processedAt: Date;

  @Prop()
  failureReason: string;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

// Performance indexes
PayoutSchema.index({ doctorId: 1, createdAt: -1 }); // Doctor payout history
PayoutSchema.index({ status: 1 }); // Filter by status
PayoutSchema.index({ batchId: 1 }); // Group by batch
PayoutSchema.index({ scheduledFor: 1, status: 1 }); // Find pending payouts to process
