import { Inject, Injectable } from '@nestjs/common';
import { AccountKind, AccountStatus } from '@prisma/client';
import { hash, verify } from 'argon2';
import type { Response } from 'express';
import { z } from 'zod';
import { hmac256, randomToken } from '../common/crypto';
import { badRequest, unauthorized } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from './auth.types';
import { PolicyService } from './policy.service';
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
    @Inject(PolicyService) private readonly policy: PolicyService,
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
    if (
      !account ||
      account.status === AccountStatus.INACTIVE ||
      !(await verify(account.passwordHash, parsed.data.password))
    )
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
    const principal = await this.policy.resolvePrincipal(account, session);
    return this.sessionShape(account, principal);
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
    const principal = await this.policy.resolvePrincipal(account, {
      id: actor.sessionId,
      passwordRestricted: actor.passwordRestricted,
    });
    return {
      ...this.sessionShape(account, principal),
      employee: account.employee
        ? {
            noReg: account.employee.noReg,
            name: account.employee.name,
            directorate: principal.directorate,
            division: principal.division,
            department: principal.department,
            section: principal.section,
            structuralPosition: principal.structuralPosition,
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
      if (account.accountKind === AccountKind.UNION)
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
    account: {
      id: string;
      username: string;
      displayName: string;
      accountKind: AccountKind;
      status: AccountStatus;
    },
    principal: AuthActor,
  ) {
    return {
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        accountKind: account.accountKind,
        status: account.status,
      },
      workforceProfile:
        account.accountKind === AccountKind.WORKFORCE
          ? {
              structuralPosition: principal.structuralPosition,
              organizationSnapshotId: principal.organizationSnapshotId,
              organizationUnitId: principal.organizationUnitId,
            }
          : null,
      unionProfile: principal.unionSlot ? { slot: principal.unionSlot } : null,
      capabilities: principal.capabilities,
      scopes: {
        overview: this.overviewScopes(principal),
        detail: this.detailScopes(principal),
        action: this.actionScopes(principal),
      },
      sessionId: principal.sessionId,
      passwordChangeRequired: principal.passwordRestricted,
    };
  }

  private overviewScopes(actor: AuthActor) {
    if (
      actor.capabilities.some((value) =>
        ['DIRECTOR', 'DIVISION_LEADERSHIP', 'UNION_HEAD', 'UNION_OFFICER'].includes(value),
      )
    )
      return ['GENERAL_GLOBAL'];
    if (actor.capabilities.includes('CARE_ADMIN')) return ['ADMIN_OPERATIONAL'];
    if (actor.capabilities.includes('MANAGER')) return ['GENERAL_OWN_DIVISION'];
    return ['OWN'];
  }

  private detailScopes(actor: AuthActor) {
    if (actor.capabilities.includes('CARE_ADMIN')) return ['GENERAL_ALL', 'PRIVATE_ALL_READ_ONLY'];
    if (
      actor.capabilities.some((value) =>
        ['DIRECTOR', 'UNION_HEAD', 'UNION_OFFICER'].includes(value),
      )
    )
      return ['GENERAL_ALL'];
    if (actor.capabilities.includes('DIVISION_LEADERSHIP')) return ['GENERAL_OWN_DIVISION'];
    if (actor.capabilities.includes('MANAGER'))
      return ['GENERAL_OWN_DEPARTMENT', 'EXPLICIT_WORK_ITEMS'];
    if (actor.capabilities.includes('SECTION_HEAD')) return ['ASSIGNED', 'OWN'];
    return ['OWN'];
  }

  private actionScopes(actor: AuthActor) {
    const result = ['REPORTER_OWN'];
    if (actor.capabilities.includes('MANAGER')) result.push('ROUTE_OWNED_GENERAL');
    if (actor.capabilities.includes('SECTION_HEAD')) result.push('ASSIGNED_GENERAL');
    if (actor.capabilities.includes('UNION_HEAD')) result.push('PRIVATE_ALL');
    if (actor.capabilities.includes('UNION_OFFICER')) result.push('PRIVATE_ASSIGNED');
    return result;
  }
}
