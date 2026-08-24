import { HttpException, HttpStatus } from '@nestjs/common';

export type FieldError = { field: string; code: string; message: string };

export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number,
    public readonly errors: FieldError[] = [],
    public readonly meta?: Record<string, unknown>,
  ) {
    super({ code, message, errors, meta }, status);
  }
}
export const badRequest = (code: string, message: string, errors: FieldError[] = []) =>
  new AppError(code, message, HttpStatus.BAD_REQUEST, errors);
export const unauthorized = () =>
  new AppError('UNAUTHENTICATED', 'Authentication is required', HttpStatus.UNAUTHORIZED);
export const forbiddenAsNotFound = () =>
  new AppError('NOT_FOUND', 'Resource not found', HttpStatus.NOT_FOUND);
export const conflict = (code: string, message: string, meta?: Record<string, unknown>) =>
  new AppError(code, message, HttpStatus.CONFLICT, [], meta);
export const invalidTransition = (message: string) =>
  new AppError('INVALID_TRANSITION', message, HttpStatus.UNPROCESSABLE_ENTITY);
