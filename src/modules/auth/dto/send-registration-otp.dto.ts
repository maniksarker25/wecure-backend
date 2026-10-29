import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from 'src/common/enum/role.enum';

export class SendRegistrationOtpDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsEnum(Role)
  role: Role;

  @ValidateIf((o) => o.role === Role.DOCTOR)
  @IsNotEmpty({ message: 'Doctor ID is required for doctor accounts' })
  doctorId?: string;
}
