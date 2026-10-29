import { IsNotEmpty } from 'class-validator';

export class AddDoctorExperienceDto {
  @IsNotEmpty()
  organizationName: string;

  @IsNotEmpty()
  designation: string;

  // @IsDateString()
  startDate?: string;

  endDate?: string;

  isCurrent?: boolean;
}
