import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';
import type { Response } from 'express';
import { z } from 'zod';
import { hmac256, randomToken } from '../common/crypto';
import { badRequest, unauthorized } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from './auth.types';
import { ThrottleService } from './throttle.service';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(6).max(128),
});

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ThrottleService) private readonly throttle: ThrottleService,
  ) {}
  async login(input: unknown, response: Response, ip: string, userAgent?: string) {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Invalid credentials');
    const username = parsed.data.username.toLocaleLowerCase('en-US');
    await Promise.all([
      this.throttle.consume('login-ip', ip, 50, 15 * 60_000),
      this.throttle.consume('login-account', username, 10, 15 * 60_000),
    ]);
    const account = await this.prisma.userAccount.findUnique({
      where: { username },
    });
    if (!account || !account.active || !(await verify(account.passwordHash, parsed.data.password)))
      throw unauthorized();
    const config = loadConfig();
    const token = randomToken();
    const csrfSecret = randomToken();
    const now = Date.now();
    const session = await this.prisma.session.create({
      data: {
        accountId: account.id,
        tokenHash: hmac256(config.SESSION_HASH_SECRET, token),
        csrfSecret: hmac256(config.SESSION_CSRF_SECRET, csrfSecret),
        ipHash: hmac256(config.AUTH_THROTTLE_SECRET, ip),
        userAgent: userAgent?.slice(0, 300),
        passwordRestricted: account.passwordChangeRequired,
        expiresAt: new Date(now + config.SESSION_IDLE_HOURS * 3_600_000),
        absoluteExpiresAt: new Date(now + config.SESSION_ABSOLUTE_DAYS * 86_400_000),
      },
    });
    response.cookie(config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test',
      sameSite: 'lax',
      path: '/',
      expires: session.absoluteExpiresAt,
    });
    return this.sessionShape(account, session.id, session.passwordRestricted);
  }
  async logout(actor: AuthActor, response: Response) {
    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: actor.sessionId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.pushSubscription.updateMany({
        where: { sessionId: actor.sessionId },
        data: { active: false },
      }),
    ]);
    response.clearCookie(loadConfig().SESSION_COOKIE_NAME, { path: '/' });
    return { success: true };
  }
  async session(actor: AuthActor) {
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: actor.accountId },
      include: { employee: true },
    });
    return {
      ...this.sessionShape(account, actor.sessionId, actor.passwordRestricted),
      employee: account.employee
        ? {
            noReg: account.employee.noReg,
            name: account.employee.name,
            division: account.employee.division,
            department: account.employee.department,
          }
        : null,
    };
  }
  async csrf(actor: AuthActor) {
    const session = await this.prisma.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
    return {
      token: hmac256(loadConfig().SESSION_CSRF_SECRET, `${session.csrfSecret}:${actor.sessionId}`),
    };
  }
  async changePassword(actor: AuthActor, input: unknown) {
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Password validation failed');
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: actor.accountId },
    });
    if (!(await verify(account.passwordHash, parsed.data.currentPassword))) throw unauthorized();
    if (
      parsed.data.newPassword === account.username ||
      parsed.data.newPassword === parsed.data.currentPassword
    )
      throw badRequest(
        'PASSWORD_REUSE',
        'New password must differ from username and current password',
      );
    const passwordHash = await hash(parsed.data.newPassword, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: account.id },
        data: { passwordHash, passwordChangeRequired: false },
      });
      if (account.role === 'UNION')
        await tx.session.updateMany({
          where: { accountId: account.id, id: { not: actor.sessionId }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.session.update({
        where: { id: actor.sessionId },
        data: { passwordRestricted: false },
      });
    });
    return { success: true };
  }
  private sessionShape(
    account: { id: string; username: string; displayName: string; role: string },
    sessionId: string,
    passwordChangeRequired: boolean,
  ) {
    return {
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
      },
      sessionId,
      passwordChangeRequired,
    };
  }
}
