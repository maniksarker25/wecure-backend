import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from 'src/common/enum/role.enum';

export class RegisterDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsEnum(Role)
  role: Role;

  @ValidateIf((dto) => dto.role === Role.DOCTOR)
  @IsNotEmpty({ message: 'National doctor ID is required' })
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
