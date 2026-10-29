import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ContactSupportStatus } from '../schemas/contact-support.schema';

export class UpdateContactSupportDto {
  @IsEnum(ContactSupportStatus)
  @IsOptional()
  status?: ContactSupportStatus;

  @IsString()
  @IsOptional()
  adminResponse?: string;
}
