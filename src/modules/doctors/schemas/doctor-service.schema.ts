import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type DoctorServiceDocument = DoctorService & Document;

@Schema({ timestamps: true })
export class DoctorService {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true, index: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;
}

export const DoctorServiceSchema = SchemaFactory.createForClass(DoctorService);

DoctorServiceSchema.index({ doctorId: 1, name: 1 }, { unique: true });
