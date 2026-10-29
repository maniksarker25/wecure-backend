import { IsString, IsNotEmpty } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
