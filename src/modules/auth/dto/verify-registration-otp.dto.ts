import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class VerifyRegistrationOtpDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
