import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Appointment,
  AppointmentSchema,
} from '../appointments/schemas/appointment.schema';
import { DoctorsModule } from '../doctors/doctors.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import {
  DoctorAvailability,
  DoctorAvailabilitySchema,
} from './schemas/availability.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DoctorAvailability.name,
        schema: DoctorAvailabilitySchema,
      },
      {
        name: Appointment.name,
        schema: AppointmentSchema,
      },
    ]),
    forwardRef(() => DoctorsModule),
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
