import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';

/**
 * Doctor information for appointment details
 */
export class DoctorInfoDto {
  name: string;
  specialty: string;
  organization: string;
  rating: number;
  totalReviews: number;
  experienceYears?: number;
  profileImage?: string;
  userId: string;
}

/**
 * Attachment information with signed URL
 */
export class AttachmentDto {
  _id: string;
  fileKey?: string;
  fileType?: string;
  url: string;
  createdAt: Date;
}

export class AppointmentDetailsDto {
  _id: string;
  appointmentDate: Date;
  appointmentTime: string;
  appointmentEndTime: string;
  status: AppointmentStatus;
  consultationFee: number;
  reasonTitle?: string;
  reasonDetails?: string;
  doctorInfo: DoctorInfoDto;
  attachments: AttachmentDto[];
  doctorTimezone: string;
  createdAt: Date;
}
