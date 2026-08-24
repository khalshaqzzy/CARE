import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { loadConfig } from '../config';
import { forbiddenAsNotFound, unauthorized } from '../common/errors';
import { hmac256, safeEqual } from '../common/crypto';
import { PrismaService } from '../prisma.service';
import { PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { ThrottleService } from './throttle.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[loadConfig().SESSION_COOKIE_NAME] as string | undefined;
    if (!token) throw unauthorized();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hmac256(loadConfig().SESSION_HASH_SECRET, token) },
      include: { account: true },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      !session.account.active ||
      session.expiresAt <= now ||
      session.absoluteExpiresAt <= now
    )
      throw unauthorized();
    request.actor = {
      accountId: session.accountId,
      sessionId: session.id,
      role: session.account.role,
      username: session.account.username,
      employeeId: session.account.employeeId,
      passwordRestricted: session.passwordRestricted,
    };
    const allowed = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(session.account.role)) throw forbiddenAsNotFound();
    const path = request.path;
    if (
      session.passwordRestricted &&
      ![
        '/api/v1/auth/session',
        '/api/v1/auth/csrf',
        '/api/v1/auth/change-password',
        '/api/v1/auth/logout',
      ].includes(path)
    )
      throw forbiddenAsNotFound();
    const refreshed = new Date(
      Math.min(
        now.getTime() + loadConfig().SESSION_IDLE_HOURS * 3_600_000,
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: refreshed },
    });
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const actor = request.actor;
    if (!actor) throw unauthorized();
    const supplied = request.header('X-CSRF-Token');
    if (!supplied) throw unauthorized();
    const session = await this.prisma.session.findUnique({
      where: { id: actor.sessionId },
      select: { csrfSecret: true },
    });
    const expected = session
      ? hmac256(loadConfig().SESSION_CSRF_SECRET, `${session.csrfSecret}:${actor.sessionId}`)
      : '';
    if (!safeEqual(supplied, expected)) throw unauthorized();
    return true;
  }
}

@Injectable()
export class MutationThrottleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ThrottleService) private readonly throttle: ThrottleService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (!request.actor) throw unauthorized();
    await this.throttle.consume('mutation-account', request.actor.accountId, 120, 60_000);
    return true;
  }
}
