import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type DonationDocument = Donation & Document;

@Schema({ timestamps: true })
export class Donation {
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
}

export const DonationSchema = SchemaFactory.createForClass(Donation);

// Performance indexes for common queries
DonationSchema.index({ userId: 1 }); // User donation history
DonationSchema.index({ paystackReference: 1 }, { unique: true }); // Webhook lookups
DonationSchema.index({ status: 1 }); // Filter by donation status
DonationSchema.index({ userId: 1, createdAt: -1 }); // Donation history chronologically
