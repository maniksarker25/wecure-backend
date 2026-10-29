import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class AddBankDetailsDto {
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsNotEmpty()
  @IsString()
  @Length(10, 10)
  accountNumber: string;

  @IsNotEmpty()
  @IsString()
  bankCode: string;
}
