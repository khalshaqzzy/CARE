import { z } from 'zod';
import { badRequest } from './errors';

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw badRequest(
    'VALIDATION_ERROR',
    'Request validation failed',
    result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  );
}
