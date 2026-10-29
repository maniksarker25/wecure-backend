import { IsEmail } from 'class-validator';

export class SendResetPasswordOtpDto {
  @IsEmail()
  email: string;
}
