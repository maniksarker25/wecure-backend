import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const params = request.params;

    if (!user) {
      return false;
    }

    // Admin can access everything
    if (user.role === 'ADMIN') {
      return true;
    }

    // Check if the resource ID in params matches the user ID
    // This is a simple check, more complex logic might be needed for specific resources
    if (params.userId && params.userId !== user.userId) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}
