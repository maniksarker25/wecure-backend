import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type WellnessTipLikeDocument = WellnessTipLike & Document;

@Schema({ timestamps: true })
export class WellnessTipLike {
  @Prop({ type: Types.ObjectId, ref: 'WellnessTip', required: true })
  tipId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;
}

export const WellnessTipLikeSchema =
  SchemaFactory.createForClass(WellnessTipLike);

WellnessTipLikeSchema.index({ tipId: 1, userId: 1 }, { unique: true });