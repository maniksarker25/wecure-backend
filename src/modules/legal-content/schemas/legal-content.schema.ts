import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LegalContentDocument = LegalContent & Document;

export enum LegalContentType {
  TERMS_AND_CONDITIONS = 'terms_and_conditions',
  PRIVACY_POLICY = 'privacy_policy',
}

@Schema({ timestamps: true })
export class LegalContent {
  @Prop({
    type: String,
    enum: LegalContentType,
    required: true,
    unique: true,
  })
  type: LegalContentType;

  @Prop({ required: true })
  content: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const LegalContentSchema = SchemaFactory.createForClass(LegalContent);
