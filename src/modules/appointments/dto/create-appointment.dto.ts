import {
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsNotEmpty()
  doctorId: string;

  @IsOptional()
  specialistId?: string;

  @IsDateString()
  appointmentDate: string;

  @IsNotEmpty()
  appointmentTime: string; // HH:mm

  @IsOptional()
  @IsString()
  reasonTitle?: string;

  @IsOptional()
  @IsString()
  reasonDetails?: string;

  @IsOptional()
  @IsString({ each: true })
  attachmentIds?: string[];
}
