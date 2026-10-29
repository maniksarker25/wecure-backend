import { IsNotEmpty, IsString } from 'class-validator';

export class AddAppointmentAttachmentDto {
  @IsNotEmpty()
  @IsString()
  fileKey: string;

  @IsNotEmpty()
  @IsString()
  fileType: string;
}
