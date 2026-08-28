import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const valid = /^[A-Za-z0-9._:-]{1,100}$/;
export function correlationMiddleware(request: Request, response: Response, next: NextFunction) {
  const supplied = request.header('X-Correlation-ID');
  const id = supplied && valid.test(supplied) ? supplied : randomUUID();
  response.setHeader('X-Correlation-ID', id);
  request.headers['x-correlation-id'] = id;
  next();
}
