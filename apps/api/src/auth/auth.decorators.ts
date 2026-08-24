import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { unauthorized } from '../common/errors';

export const PUBLIC_KEY = 'care:public';
export const ROLES_KEY = 'care:roles';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const actor = context.switchToHttp().getRequest<Request>().actor;
  if (!actor) throw unauthorized();
  return actor;
});
