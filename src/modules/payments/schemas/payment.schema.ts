import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true })
  appointmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  paystackReference: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'NGN' })
  currency: string;

  @Prop({ enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' })
  status: string;

  // Refund tracking
  @Prop({ type: Types.ObjectId, ref: 'Refund' })
  refundId?: Types.ObjectId;

  @Prop({ default: 0 })
  refundedAmount: number;

  @Prop({ default: false })
  isRefunded: boolean;

  @Prop()
  refundedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Performance indexes for common queries
PaymentSchema.index({ userId: 1 }); // User payment history
PaymentSchema.index({ appointmentId: 1 }); // Find payment by appointment
PaymentSchema.index({ paystackReference: 1 }, { unique: true }); // Webhook lookups
PaymentSchema.index({ status: 1 }); // Filter by payment status
PaymentSchema.index({ userId: 1, createdAt: -1 }); // Payment history chronologically
