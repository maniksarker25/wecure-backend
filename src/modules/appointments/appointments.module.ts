import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentFinderService } from 'src/modules/appointments/services/appointment-finder.service';
import { AppointmentManagerService } from 'src/modules/appointments/services/appointment-manager.service';
import { AppointmentValidatorService } from 'src/modules/appointments/services/appointment-validator.service';
import { AgoraModule } from '../agora/agora.module';
import { AvailabilityModule } from '../availability/availability.module';
import {
  DoctorAvailability,
  DoctorAvailabilitySchema,
} from '../availability/schemas/availability.schema';
import { DoctorsModule } from '../doctors/doctors.module';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { PaymentsModule } from '../payments/payments.module';
import { RefundsModule } from '../refunds/refunds.module';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { UploadsModule } from '../uploads/uploads.module';
import { AppointmentSchedulerService } from './appointment.scheduler';
import { AppointmentsController } from './appointments.controller';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import {
  AppointmentAttachment,
  AppointmentAttachmentSchema,
} from './schemas/attachment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      {
        name: AppointmentAttachment.name,
        schema: AppointmentAttachmentSchema,
      },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: DoctorAvailability.name, schema: DoctorAvailabilitySchema },
    ]),
    AvailabilityModule,
    forwardRef(() => DoctorsModule),
    AgoraModule,
    UploadsModule,
    RefundsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentSchedulerService,
    AppointmentValidatorService,
    AppointmentFinderService,
    AppointmentManagerService,
  ],
  exports: [
    AppointmentValidatorService,
    AppointmentFinderService,
    AppointmentManagerService,
  ],
})
export class AppointmentsModule {}
