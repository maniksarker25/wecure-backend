import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LegalContentService } from './legal-content.service';
import { LegalContentController } from './legal-content.controller';
import {
  LegalContent,
  LegalContentSchema,
} from './schemas/legal-content.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LegalContent.name, schema: LegalContentSchema },
    ]),
  ],
  providers: [LegalContentService],
  controllers: [LegalContentController],
  exports: [LegalContentService],
})
export class LegalContentModule {}
