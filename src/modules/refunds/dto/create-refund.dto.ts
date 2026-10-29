import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { RefundReason } from '../schemas/refund.schema';

export class CreateRefundDto {
  @IsMongoId()
  paymentId: string;

  @IsMongoId()
  appointmentId: string;

  @IsMongoId()
  userId: string;

  @IsMongoId()
  doctorId: string;

  @IsNumber()
  amount: number;

  @IsNumber()
  originalAmount: number;

  @IsNumber()
  refundPercentage: number;

  @IsEnum(RefundReason)
  reason: RefundReason;

  @IsMongoId()
  initiatedBy: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
