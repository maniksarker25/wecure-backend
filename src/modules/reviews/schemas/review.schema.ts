import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Appointment', unique: true })
  appointmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({ min: 1, max: 5, required: true })
  rating: number;

  @Prop()
  reviewText: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Performance indexes for common queries
ReviewSchema.index({ doctorId: 1 }); // Fetch all reviews for a doctor (very common)
ReviewSchema.index({ userId: 1 }); // User review history
ReviewSchema.index({ rating: 1 }); // Filter by rating
ReviewSchema.index({ doctorId: 1, createdAt: -1 }); // Recent reviews for a doctor
// ReviewSchema.index({ appointmentId: 1 }, { unique: true }); // Already defined in Prop
