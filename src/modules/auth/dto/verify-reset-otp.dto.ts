import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class VerifyResetOtpDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
