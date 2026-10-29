import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { Doctor, DoctorSchema } from './schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceSchema,
} from './schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceSchema,
} from './schemas/doctor-experience.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { AvailabilityModule } from '../availability/availability.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { SpecialistModule } from '../specialist/specialist.module';
import { DoctorAggregationHelper } from './helpers/doctor-aggregation.helper';
import { DoctorRatingHelper } from './helpers/doctor-rating.helper';
import { DoctorSlotsHelper } from './helpers/doctor-slots.helper';
import { DoctorManagementService } from './services/doctor-management.service';
import { DoctorAdminService } from './services/doctor-admin.service';
import { DoctorPublicService } from './services/doctor-public.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: DoctorService.name, schema: DoctorServiceSchema },
      { name: DoctorExperience.name, schema: DoctorExperienceSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    forwardRef(() => AvailabilityModule),
    forwardRef(() => AppointmentsModule),
    MailModule,
    UsersModule,
    SpecialistModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [DoctorsController],
  providers: [
    DoctorsService,
    DoctorManagementService,
    DoctorAdminService,
    DoctorPublicService,
    DoctorAggregationHelper,
    DoctorRatingHelper,
    DoctorSlotsHelper,
  ],
  exports: [DoctorsService, MongooseModule],
})
export class DoctorsModule {}
