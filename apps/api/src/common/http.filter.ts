import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = String(
      request.headers['x-correlation-id'] ?? response.getHeader('X-Correlation-ID') ?? 'unknown',
    );
    const status =
      error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = error instanceof HttpException ? error.getResponse() : {};
    const value = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    response.status(status).json({
      code:
        typeof value.code === 'string'
          ? value.code
          : status === 500
            ? 'INTERNAL_ERROR'
            : 'HTTP_ERROR',
      message:
        typeof value.message === 'string'
          ? value.message
          : status === 500
            ? 'An internal error occurred'
            : String(value.message ?? 'Request failed'),
      errors: Array.isArray(value.errors) ? value.errors : [],
      ...(value.meta ? { meta: value.meta } : {}),
      correlationId,
    });
  }
}
