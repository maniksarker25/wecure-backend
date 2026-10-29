import { PartialType } from '@nestjs/mapped-types';
import { AddExperienceDto } from './add-experience.dto';

export class UpdateExperienceDto extends PartialType(AddExperienceDto) {}
