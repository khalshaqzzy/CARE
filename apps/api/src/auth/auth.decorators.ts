import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '../common/errors';
import type { Capability } from './capabilities';

export const PUBLIC_KEY = 'care:public';
export const CAPABILITIES_KEY = 'care:capabilities';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Capabilities = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const actor = context.switchToHttp().getRequest<Request>().actor;
  if (!actor) throw unauthorized();
  return actor;
});
