import { IsNotEmpty } from 'class-validator';

export class AddDoctorServiceDto {
  @IsNotEmpty()
  name: string;
}
