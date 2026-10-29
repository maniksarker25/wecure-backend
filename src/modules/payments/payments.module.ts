import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackService } from './paystack.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DonationsModule } from '../donations/donations.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { forwardRef } from '@nestjs/common';
import { PayoutsModule } from '../payouts/payouts.module';
import { RefundsModule } from '../refunds/refunds.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    forwardRef(() => AppointmentsModule),
    DonationsModule,
    AuditLogsModule,
    forwardRef(() => PayoutsModule),
    forwardRef(() => RefundsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackService],
  exports: [PaymentsService, PaystackService],
})
export class PaymentsModule {}
