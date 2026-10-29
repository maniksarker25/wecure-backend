import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class Participant {
  @Prop({ type: Types.ObjectId, required: true })
  id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['USER', 'ADMIN', 'SUPER_ADMIN', 'DOCTOR'],
  })
  role: string;
}

@Schema({ _id: false })
export class BlockedBy {
  @Prop({ type: Types.ObjectId, required: true })
  id: Types.ObjectId;

  @Prop({ type: String, required: true })
  role: string;
}

export type ConversationDocument = Conversation & Document;

@Schema({
  timestamps: true,
  collection: 'conversations',
})
export class Conversation {
  @Prop({ type: [Participant], required: true })
  participants: Participant[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Message' }], default: [] })
  messages: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Appointment', default: null })
  appointmentId: Types.ObjectId;

  @Prop({ type: [BlockedBy], default: [] })
  blockedBy: BlockedBy[];

  @Prop({
    type: {
      lastActivityAt: Date,
    },
    default: {},
  })
  meta: {
    lastActivityAt: Date;
  };
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ 'participants.id': 1 });
ConversationSchema.index({ updatedAt: -1 });
