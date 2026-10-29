import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';

export class AppointmentListDto {
  _id: string;
  doctorName: string;
  specialtyName: string;
  appointmentDate: Date;
  appointmentTime: string;
  appointmentEndTime: string;
  status: AppointmentStatus;
  consultationFee: number;
}
