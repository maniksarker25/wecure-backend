import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SpecialistService } from './specialist.service';
import { SpecialistController } from './specialist.controller';
import { Specialist, SpecialistSchema } from './schemas/specialist.schema';
import { PublicUploadModule } from '../public-upload/public-upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Specialist.name, schema: SpecialistSchema },
    ]),
    PublicUploadModule,
  ],
  controllers: [SpecialistController],
  providers: [SpecialistService],
  exports: [SpecialistService],
})
export class SpecialistModule {}
