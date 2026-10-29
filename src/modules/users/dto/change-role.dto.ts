import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '../../../common/enum/role.enum';

export class ChangeRoleDto {
  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;
}
