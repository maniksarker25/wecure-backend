import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // 1. Get metadata
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      // no roles required → allow
      return true;
    }

    // 2. Grab request.user
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      // JWT guard didn’t populate user
      return false;
    }

    // 3. Check role
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }
    return requiredRoles.includes(user.role);
  }
}
