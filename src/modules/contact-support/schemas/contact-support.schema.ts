import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type ContactSupportDocument = ContactSupport & Document;

export enum ContactSupportStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

@Schema({ timestamps: true })
export class ContactSupport {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ContactSupportStatus),
    default: ContactSupportStatus.PENDING,
  })
  status: ContactSupportStatus;

  @Prop()
  adminResponse: string;

  @Prop()
  attachment: string;
}

export const ContactSupportSchema =
  SchemaFactory.createForClass(ContactSupport);

// Performance indexes for common queries
ContactSupportSchema.index({ userId: 1 }); // User support history
ContactSupportSchema.index({ status: 1 }); // Admin filtering by status
ContactSupportSchema.index({ createdAt: -1 }); // Recent tickets first
ContactSupportSchema.index({ userId: 1, status: 1 }); // User's tickets by status
