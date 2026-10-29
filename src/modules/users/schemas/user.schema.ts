import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BloodGroup } from 'src/common/enum/blood-group.enum';
import { Role } from 'src/common/enum/role.enum';
import { UserStatus } from 'src/common/enum/user.status.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, enum: Role })
  role: Role;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  phone: string;

  @Prop({ required: true })
  password: string;

  @Prop({ unique: true, sparse: true })
  doctorId?: string;

  @Prop()
  refreshToken?: string;

  @Prop({ default: UserStatus.ACTIVE, enum: UserStatus })
  status: string;

  @Prop()
  emailVerificationOtp?: string;

  @Prop()
  emailVerificationOtpExpires?: Date;

  @Prop()
  passwordResetOtp?: string;

  @Prop()
  passwordResetOtpExpires?: Date;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  dateOfBirth?: string; // Encrypted

  @Prop()
  profileImage?: string;

  @Prop({ type: [String], default: [] })
  fcmTokens: string[];

  @Prop()
  allergies: string; // Encrypted JSON string

  @Prop({ enum: BloodGroup })
  bloodGroup?: string;

  @Prop()
  bankName?: string;

  @Prop()
  accountName?: string;

  @Prop()
  accountNumber?: string;

  @Prop({ default: 'Africa/Lagos' })
  timezone: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Performance indexes for common queries
UserSchema.index({ role: 1 }); // Filter by role (admin queries)
UserSchema.index({ status: 1 }); // Filter by status
UserSchema.index({ isEmailVerified: 1 }); // Filter verified users
UserSchema.index({ role: 1, status: 1 }); // Compound index for admin queries
