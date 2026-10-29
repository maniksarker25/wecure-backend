import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SpecialistDocument = Specialist & Document;

@Schema({ timestamps: true })
export class Specialist {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  thumbnail: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const SpecialistSchema = SchemaFactory.createForClass(Specialist);

SpecialistSchema.index({ name: 1 }, { unique: true });
