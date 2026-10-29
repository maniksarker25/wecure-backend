import { Module } from '@nestjs/common';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { AppointmentsModule } from 'src/modules/appointments/appointments.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { AvailabilityModule } from 'src/modules/availability/availability.module';
import { ChatModule } from 'src/modules/chat/chat.module';
import { DoctorsModule } from 'src/modules/doctors/doctors.module';
import { UsersModule } from 'src/modules/users/users.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module';
import { WellnessTipsModule } from './wellness-tips/wellness-tips.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SpecialistModule } from './specialist/specialist.module';
import { UploadsModule } from './uploads/uploads.module';
import { PublicUploadModule } from 'src/modules/public-upload/public-upload.module';
import { ContactSupportModule } from './contact-support/contact-support.module';
import { LegalContentModule } from './legal-content/legal-content.module';
import { SeederModule } from 'src/modules/seeder/seeder.module';
import { AgoraModule } from 'src/modules/agora/agora.module';
import { RefundsModule } from './refunds/refunds.module';
import { PayoutsModule } from './payouts/payouts.module';
import { FirebaseModule } from './firebase/firebase.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    DoctorsModule,
    AvailabilityModule,
    AppointmentsModule,
    ChatModule,
    ReviewsModule,
    PaymentsModule,
    // DonationsModule,
    AgoraModule,
    SeederModule,
    WellnessTipsModule,
    AuditLogsModule,
    SpecialistModule,
    UploadsModule,
    PublicUploadModule,
    ContactSupportModule,
    LegalContentModule,
    RefundsModule,
    PayoutsModule,
    FirebaseModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class DomainModule {}
