import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  resource: string;

  @Prop()
  resourceId: string;

  @Prop()
  ipAddress: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Performance indexes for common queries
AuditLogSchema.index({ userId: 1 }); // User activity history
AuditLogSchema.index({ action: 1 }); // Filter by action type
AuditLogSchema.index({ resource: 1 }); // Filter by resource type
AuditLogSchema.index({ userId: 1, createdAt: -1 }); // Recent user activity
AuditLogSchema.index({ resource: 1, resourceId: 1 }); // Resource-specific audit trails
AuditLogSchema.index({ createdAt: -1 }); // Time-based queries
