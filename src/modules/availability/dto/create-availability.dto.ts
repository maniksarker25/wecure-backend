import { IsEnum, IsNotEmpty, IsNumber, Matches, Min } from 'class-validator';
import { DayOfWeek } from 'src/common/enum/days.enum';

export class CreateAvailabilityDto {
  @IsEnum(DayOfWeek, { each: true })
  days: DayOfWeek[];

  @IsNumber()
  @Min(5)
  slotSizeMinutes: number;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime: string;

  @IsNumber()
  @Min(0)
  fee: number;
}
