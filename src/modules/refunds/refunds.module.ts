import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RefundsService } from './refunds.service';
import { RefundsController } from './refunds.controller';
import { Refund, RefundSchema } from './schemas/refund.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { PaymentsModule } from '../payments/payments.module'; // Import to use exported PaystackService if available, or just providers
import { HttpModule } from '@nestjs/axios';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Refund.name, schema: RefundSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    HttpModule,
    AuditLogsModule,
    ConfigModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => AppointmentsModule),
  ],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
