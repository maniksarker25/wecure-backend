import {
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDoctorDto {
  @IsNotEmpty()
  @IsString()
  currentOrganization: string;

  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  specialtyId: string;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  mdcnRegistrationNumber?: string;

  @IsOptional()
  @IsISO8601()
  mdcnPracticingLicenseExpiryDate?: string;
}
