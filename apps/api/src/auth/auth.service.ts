import { Inject, Injectable } from '@nestjs/common';
import { AccountKind, AccountStatus, Prisma, UserAccount } from '@prisma/client';
import { hash, verify } from 'argon2';
import type { Response } from 'express';
import { z } from 'zod';
import { hmac256, randomToken } from '../common/crypto';
import { badRequest, forbiddenAsNotFound, unauthorized } from '../common/errors';
import { parseBirthDate } from '../common/birth-date';
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
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(6).max(128),
});

const identifierSchema = z.object({ noReg: z.string().trim().min(1).max(64) });

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
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, username);
      if (
        !account ||
        account.status === AccountStatus.INACTIVE ||
        !(await verify(account.passwordHash, parsed.data.password))
      )
        throw unauthorized();
      return this.createSession(tx, account, ip, userAgent);
    });
    return this.completeLogin(result, response);
  }

  private async lockAccount(tx: Prisma.TransactionClient, username: string) {
    await tx.$queryRaw`SELECT "id" FROM "UserAccount" WHERE "username" = ${username} FOR UPDATE`;
    return tx.userAccount.findUnique({ where: { username }, include: { employee: true } });
  }

  private identifier(input: unknown) {
    const parsed = identifierSchema.safeParse(input);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Registration number is required');
    return parsed.data.noReg.toLocaleLowerCase('en-US');
  }

  async startLogin(input: unknown, response: Response, ip: string, userAgent?: string) {
    const username = this.identifier(input);
    await Promise.all([
      this.throttle.consume('login-ip', ip, 50, 15 * 60_000),
      this.throttle.consume('login-account', username, 10, 15 * 60_000),
    ]);
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, username);
      if (
        !account ||
        account.status === AccountStatus.INACTIVE ||
        account.accountKind === AccountKind.CARE_ADMIN
      )
        throw badRequest('LOGIN_IDENTIFIER_INVALID', 'Periksa No. Reg atau username Anda.');
      if (
        account.accountKind !== AccountKind.WORKFORCE ||
        account.status !== AccountStatus.ACTIVE ||
        !account.passwordChangeRequired ||
        !(await this.hasDefaultPassword(account))
      )
        return null;
      return this.createSession(tx, account, ip, userAgent);
    });
    if (!result) return { next: 'PASSWORD_REQUIRED' as const };
    return {
      next: 'CHANGE_PASSWORD' as const,
      session: await this.completeLogin(result, response),
    };
  }

  private async hasDefaultPassword(account: UserAccount & { employee?: { noReg: string } | null }) {
    // Older Admin resets used the source's original casing for alphanumeric No. Reg.
    return (
      (await verify(account.passwordHash, account.username)) ||
      (!!account.employee &&
        account.employee.noReg !== account.username &&
        (await verify(account.passwordHash, account.employee.noReg)))
    );
  }

  private async createSession(
    tx: Prisma.TransactionClient,
    account: UserAccount,
    ip: string,
    userAgent?: string,
  ) {
    const config = loadConfig();
    const token = randomToken();
    const csrfSecret = randomToken();
    const now = Date.now();
    const session = await tx.session.create({
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
    return { account, session, token };
  }

  private async completeLogin(
    result: Awaited<ReturnType<AuthService['createSession']>>,
    response: Response,
  ) {
    const { account, session, token } = result;
    const config = loadConfig();
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

  private resetEligible(
    account: UserAccount & { employee: { noReg: string; birthDate: Date | null } | null },
  ) {
    return (
      account.accountKind === AccountKind.WORKFORCE &&
      account.status === AccountStatus.ACTIVE &&
      !!account.employee?.birthDate &&
      !/^tm/i.test(account.employee.noReg)
    );
  }

  async resetEligibility(input: unknown, ip: string) {
    const username = this.identifier(input);
    await Promise.all([
      this.throttle.consume('reset-eligibility-ip', ip, 50, 15 * 60_000),
      this.throttle.consume('reset-eligibility-account', username, 10, 15 * 60_000),
    ]);
    const account = await this.prisma.userAccount.findUnique({
      where: { username },
      include: { employee: true },
    });
    if (
      !account ||
      account.status !== AccountStatus.ACTIVE ||
      account.accountKind === AccountKind.CARE_ADMIN
    )
      throw badRequest('RESET_IDENTIFIER_INVALID', 'Periksa No. Reg atau username Anda.');
    return { eligible: this.resetEligible(account) };
  }

  async resetPassword(input: unknown, ip: string, correlationId: string) {
    const username = this.identifier(input);
    await Promise.all([
      this.throttle.consume('password-reset-ip', ip, 30, 15 * 60_000),
      this.throttle.consume('password-reset-account', username, 5, 15 * 60_000),
    ]);
    const birthDate = parseBirthDate((input as { birthDate?: unknown }).birthDate);
    if (!birthDate) throw badRequest('VALIDATION_ERROR', 'Pilih tanggal lahir yang valid.');
    await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, username);
      if (
        !account ||
        account.status !== AccountStatus.ACTIVE ||
        account.accountKind === AccountKind.CARE_ADMIN
      )
        throw badRequest('RESET_VERIFICATION_FAILED', 'No. Reg atau tanggal lahir tidak sesuai.');
      if (!this.resetEligible(account))
        throw badRequest(
          'PASSWORD_RESET_UNAVAILABLE',
          'Reset Password belum tersedia untuk akun Anda.',
        );
      if (account.employee!.birthDate!.toISOString().slice(0, 10) !== birthDate)
        throw badRequest('RESET_VERIFICATION_FAILED', 'No. Reg atau tanggal lahir tidak sesuai.');
      const passwordHash = await hash(account.username, {
        type: 2,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
      await tx.userAccount.update({
        where: { id: account.id },
        data: { passwordHash, passwordChangeRequired: true },
      });
      await tx.session.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.pushSubscription.updateMany({
        where: { accountId: account.id, active: true },
        data: { active: false },
      });
      await tx.auditEvent.create({
        data: {
          action: 'SELF_SERVICE_PASSWORD_RESET',
          result: 'SUCCESS',
          resourceType: 'USER_ACCOUNT',
          resourceId: account.id,
          correlationId,
          releaseSha: loadConfig().RELEASE_SHA,
          summary: { verification: 'BIRTH_DATE' },
        },
      });
    });
    return { success: true };
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
    await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, actor.username);
      const session = await tx.session.findUnique({ where: { id: actor.sessionId } });
      if (
        !account ||
        !session ||
        session.revokedAt ||
        account.status === AccountStatus.INACTIVE ||
        session.expiresAt <= new Date() ||
        session.absoluteExpiresAt <= new Date()
      )
        throw unauthorized();
      const canOmitCurrent =
        account.accountKind === AccountKind.WORKFORCE &&
        session.passwordRestricted &&
        account.passwordChangeRequired &&
        (await this.hasDefaultPassword(account));
      if (
        parsed.data.currentPassword === undefined
          ? !canOmitCurrent
          : !(await verify(account.passwordHash, parsed.data.currentPassword))
      )
        throw badRequest('CURRENT_PASSWORD_INVALID', 'Current password is incorrect');
      if (
        parsed.data.newPassword.toLocaleLowerCase('en-US') === account.username ||
        (await verify(account.passwordHash, parsed.data.newPassword))
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
      await tx.userAccount.update({
        where: { id: account.id },
        data: { passwordHash, passwordChangeRequired: false },
      });
      await tx.session.updateMany({
        where: { accountId: account.id, id: { not: actor.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.pushSubscription.updateMany({
        where: { accountId: account.id, sessionId: { not: actor.sessionId }, active: true },
        data: { active: false },
      });
      await tx.session.update({
        where: { id: actor.sessionId },
        data: { passwordRestricted: false },
      });
    });
    return { success: true };
  }
  async deferPasswordChange(actor: AuthActor, correlationId: string) {
    if (actor.accountKind !== AccountKind.WORKFORCE) throw forbiddenAsNotFound();
    await this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, actor.username);
      const session = await tx.session.findUnique({ where: { id: actor.sessionId } });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.absoluteExpiresAt <= new Date()
      )
        throw unauthorized();
      const updated = await tx.session.updateMany({
        where: { id: actor.sessionId, passwordRestricted: true },
        data: { passwordRestricted: false },
      });
      if (updated.count === 0) return;
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          action: 'PASSWORD_CHANGE_DEFERRED',
          result: 'SUCCESS',
          resourceType: 'USER_ACCOUNT',
          resourceId: actor.accountId,
          summary: { scope: 'CURRENT_SESSION' },
          correlationId,
          sessionRef: hmac256(loadConfig().SESSION_HASH_SECRET, actor.sessionId),
          releaseSha: loadConfig().RELEASE_SHA,
        },
      });
    });
    return this.session({ ...actor, passwordRestricted: false });
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
