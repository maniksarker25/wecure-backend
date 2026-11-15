import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;

    // Only intentional, developer-authored HttpExceptions are safe to show
    // verbatim to clients. An unexpected error (a bug, a raw DB driver
    // error, etc.) never leaks its internal message to the response.
    const message = isHttpException
      ? typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as any).message || exception.message
        : exception.message || 'Internal server error'
      : 'Internal server error';

    const error =
      isHttpException &&
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
        ? (exceptionResponse as any).error || null
        : null;

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.originalUrl} -> ${exception?.message || exception}`,
        exception?.stack,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message,
      error:
        error || (status === 500 ? 'Internal Server Error' : exception.name),
    });
  }
}
