import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type DoctorExperienceDocument = DoctorExperience & Document;

@Schema({ timestamps: true })
export class DoctorExperience {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true, index: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  organizationName: string;

  @Prop({ required: true })
  designation: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop()
  endDate?: Date;

  @Prop({ default: false })
  isCurrent: boolean;
}

export const DoctorExperienceSchema =
  SchemaFactory.createForClass(DoctorExperience);
