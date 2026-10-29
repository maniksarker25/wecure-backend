import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsISO8601,
  IsEnum,
} from 'class-validator';
import { BloodGroup } from 'src/common/enum/blood-group.enum';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profileImage?: string;

  @IsOptional()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsEnum(BloodGroup)
  bloodGroup?: BloodGroup;

  @IsOptional()
  @IsString()
  timezone?: string;
}
