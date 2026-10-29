import { IsEnum } from 'class-validator';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';

export class UpdateAppointmentStatusDto {
  @IsEnum([
    AppointmentStatus.PENDING,
    AppointmentStatus.UPCOMING,
    AppointmentStatus.ONGOING,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
  ])
  status: AppointmentStatus;
}
