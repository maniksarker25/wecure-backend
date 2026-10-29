import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AttachmentDocument = AppointmentAttachment & Document;

@Schema({ timestamps: true })
export class AppointmentAttachment {
  @Prop({
    type: Types.ObjectId,
    ref: 'Appointment',
    required: false,
    index: true,
  })
  appointmentId: Types.ObjectId;

  // Store S3 object key (NOT public URL)
  @Prop({ required: true })
  fileKey: string;

  @Prop({ required: true })
  fileType: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;
}

export const AppointmentAttachmentSchema = SchemaFactory.createForClass(
  AppointmentAttachment,
);

AppointmentAttachmentSchema.index(
  { appointmentId: 1, uploadedBy: 1 },
  { unique: true },
);
