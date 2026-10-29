import { IsOptional, IsString } from 'class-validator';

export class SearchDoctorDto {
  /** Full-text search query — matches doctor name or specialty name */
  @IsOptional()
  @IsString()
  q?: string;

  /** Page number (default: 1) */
  @IsOptional()
  @IsString()
  page?: string;

  /** Results per page (default: 10) */
  @IsOptional()
  @IsString()
  limit?: string;

  /** Specialty ID filter */
  @IsOptional()
  @IsString()
  specialtyId?: string;
}
