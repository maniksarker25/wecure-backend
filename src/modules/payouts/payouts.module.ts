import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PayoutFinderService } from './services/payout-finder.service';
import { PayoutManagerService } from './services/payout-manager.service';
import { PayoutHelperService } from './helpers/payout.helper';
import { PayoutsController } from './payouts.controller';
import { PayoutScheduler } from './schedulers/payout.scheduler';
import { Payout, PayoutSchema } from './schemas/payout.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../appointments/schemas/appointment.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { PaymentsModule } from '../payments/payments.module'; // Ensure PaystackService is available
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payout.name, schema: PayoutSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Doctor.name, schema: DoctorSchema },
    ]),
    HttpModule,
    AuditLogsModule,
    ConfigModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [PayoutsController],
  providers: [
    PayoutFinderService,
    PayoutManagerService,
    PayoutHelperService,
    PayoutScheduler,
    EncryptionService,
  ],
  exports: [PayoutFinderService, PayoutManagerService, PayoutHelperService],
})
export class PayoutsModule {}
