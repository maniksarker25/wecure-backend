import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type ChatDocument = Chat & Document;

@Schema({ timestamps: true })
export class Chat {
  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true })
  appointmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ enum: ['USER', 'DOCTOR'], required: true })
  senderRole: string;

  @Prop({ required: true })
  message: string;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);

// Performance indexes for common queries
ChatSchema.index({ appointmentId: 1 }); // Fetch all messages in an appointment
ChatSchema.index({ appointmentId: 1, createdAt: 1 }); // Chronological message retrieval
ChatSchema.index({ senderId: 1 }); // Filter messages by sender
