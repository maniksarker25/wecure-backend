import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ActorRef {
  @Prop({ type: Types.ObjectId, required: true })
  id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['USER', 'ADMIN', 'SUPER_ADMIN', 'DOCTOR'],
  })
  role: string;
}

export type MessageDocument = Message & Document;

@Schema({
  timestamps: true,
  collection: 'messages',
})
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId: Types.ObjectId;

  @Prop({ type: ActorRef, required: true })
  sender: ActorRef;

  @Prop({ type: ActorRef, required: true })
  receiver: ActorRef;

  @Prop({ type: String, default: '' })
  text: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, default: null })
  video: string | null;

  @Prop({ type: String, default: null })
  videoCover: string | null;

  @Prop({ type: Boolean, default: false })
  seen: boolean;

  @Prop({ type: Date, default: null })
  deliveredAt: Date | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, 'receiver.id': 1, seen: 1 });
MessageSchema.index({ createdAt: 1 });
