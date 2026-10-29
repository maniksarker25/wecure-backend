import { IsNotEmpty, IsString } from 'class-validator';

export class AddUserBankDetailsDto {
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @IsNotEmpty()
  @IsString()
  accountName: string;

  @IsNotEmpty()
  @IsString()
  accountNumber: string;
}
