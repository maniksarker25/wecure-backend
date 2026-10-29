import { Global, Module } from '@nestjs/common';
import { PublicUploadService } from './public-upload.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PublicUploadService],
  exports: [PublicUploadService],
})
export class PublicUploadModule {}
