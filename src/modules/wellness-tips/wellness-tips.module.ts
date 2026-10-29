import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WellnessTipsService } from './wellness-tips.service';
import { WellnessTipsController } from './wellness-tips.controller';
import { WellnessTip, WellnessTipSchema } from './schemas/wellness-tip.schema';
import {
  WellnessTipLike,
  WellnessTipLikeSchema,
} from './schemas/wellness-tip-like.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WellnessTip.name, schema: WellnessTipSchema },
      { name: WellnessTipLike.name, schema: WellnessTipLikeSchema },
    ]),
  ],
  controllers: [WellnessTipsController],
  providers: [WellnessTipsService],
})
export class WellnessTipsModule {}
