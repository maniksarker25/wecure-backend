import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NotificationType } from 'src/common/enum/notification-type.enum';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Object })
  data: Record<string, any>;

  @Prop({ default: false })
  isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Performance indexes for common queries
NotificationSchema.index({ userId: 1 }); // Fetch user notifications
NotificationSchema.index({ isRead: 1 }); // Filter read/unread
NotificationSchema.index({ type: 1 }); // Filter by notification type
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 }); // Unread notifications query
NotificationSchema.index({ userId: 1, createdAt: -1 }); // Notification feed chronologically
