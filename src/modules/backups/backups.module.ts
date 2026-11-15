import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UploadsModule } from '../uploads/uploads.module';
import { BackupService } from './backup.service';
import { BackupScheduler } from './backup.scheduler';
import { BackupsController } from './backups.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    UploadsModule,
  ],
  controllers: [BackupsController],
  providers: [BackupService, BackupScheduler],
  exports: [BackupService],
})
export class BackupsModule {}
