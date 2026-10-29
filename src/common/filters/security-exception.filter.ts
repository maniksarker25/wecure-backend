import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  ForbiddenException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuditLogsService } from 'src/modules/audit-logs/audit-logs.service';

@Catch(ForbiddenException, UnauthorizedException)
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);

  constructor(private readonly auditLogsService: AuditLogsService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    try {
      const user = (request as any).user;

      // Only audit log if we have a user context (otherwise we can't link to a specific user ID)
      // For 401s during login, we might not have a user object attached yet.
      if (user && user.userId) {
        let actionStr = 'ACCESS_DENIED';
        if (status === HttpStatus.UNAUTHORIZED)
          actionStr = 'UNAUTHORIZED_ACCESS';
        if (status === HttpStatus.FORBIDDEN) actionStr = 'FORBIDDEN_ACCESS';

        await this.auditLogsService.create({
          userId: user.userId,
          action: `${actionStr} - ${request.method} ${request.url}`,
          resource: request.url,
          resourceId: request.params?.id,
          ipAddress:
            request.ip || request.headers['x-forwarded-for']?.toString(),
        });
      }
    } catch (error) {
      this.logger.error(
        'Failed to create audit log for security exception',
        error,
      );
    }

    // Standard response format to match HttpExceptionFilter
    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as any).message || exception.message
        : exception.message || 'Access Denied';

    const error =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as any).error || null
        : exception.name;

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message,
      error,
    });
  }
}
