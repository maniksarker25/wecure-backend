import { IsBoolean, IsNumber, IsOptional, Matches, Min } from 'class-validator';

export class UpdateAvailabilityDto {
  @IsOptional()
  @IsNumber()
  @Min(5)
  slotSizeMinutes?: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
