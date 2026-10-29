import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePayoutDto {
  @IsString()
  doctorId: string;

  @IsString()
  batchId: string;

  @IsString({ each: true })
  appointmentIds: string[];

  @IsNumber()
  totalEarnings: number;

  @IsNumber()
  platformCommission: number;

  @IsNumber()
  payoutAmount: number;

  @IsOptional()
  @IsString()
  transferRecipientCode?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
