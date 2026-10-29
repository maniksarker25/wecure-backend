import { PartialType } from '@nestjs/mapped-types';
import { CreateWellnessTipDto } from './create-wellness-tip.dto';

export class UpdateWellnessTipDto extends PartialType(CreateWellnessTipDto) {}
