import { Inject, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import { Role, VoiceStatus } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { parse } from '../common/validation';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from '../auth/auth.types';

const accountAction = z.object({ reason: z.string().trim().min(1).max(500) });
const sectionHeadAction = z.object({
  employeeId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
const transferAction = sectionHeadAction.extend({ targetManagerId: z.string().uuid() });

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async listAccounts(cursor?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const items = await this.prisma.userAccount.findMany({
      take: take + 1,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        active: true,
        passwordChangeRequired: true,
        employee: { select: { noReg: true, department: true } },
      },
    });
    return {
      items: items.slice(0, take),
      nextCursor: items.length > take && items[take - 1] ? encodeCursor(items[take - 1].id) : null,
    };
  }
  async accountDetail(accountId: string) {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        active: true,
        passwordChangeRequired: true,
        createdAt: true,
        updatedAt: true,
        employee: {
          select: {
            id: true,
            noReg: true,
            name: true,
            division: true,
            department: true,
            active: true,
          },
        },
        managerProfile: {
          select: {
            area: true,
            department: true,
            isSafety: true,
            isFacility: true,
            active: true,
          },
        },
        _count: { select: { sessions: true, routedVoices: true, handledVoices: true } },
      },
    });
    if (!account) throw forbiddenAsNotFound();
    return account;
  }
  async revokeSessions(actor: AuthActor, accountId: string, input: unknown) {
    const { reason } = parse(accountAction, input);
    const account = await this.prisma.userAccount.findUnique({ where: { id: accountId } });
    if (!account) throw forbiddenAsNotFound();
    const result = await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.pushSubscription.updateMany({ where: { accountId }, data: { active: false } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          actorRole: actor.role,
          action: 'SESSIONS_REVOKED',
          result: 'SUCCESS',
          resourceType: 'UserAccount',
          resourceId: accountId,
          summary: { sessionCount: sessions.count },
          reason,
          correlationId: 'admin-session-revoke',
          releaseSha: process.env.RELEASE_SHA ?? 'development',
        },
      });
      return sessions;
    });
    return { revoked: result.count };
  }
  async resetAccount(actor: AuthActor, accountId: string, input: unknown) {
    const { reason } = parse(accountAction, input);
    const account = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
      include: { employee: true },
    });
    if (!account) throw forbiddenAsNotFound();
    const temporary = account.role === Role.UNION ? account.username : account.employee?.noReg;
    if (!temporary)
      throw badRequest('RESET_UNAVAILABLE', 'This account cannot use workforce reset');
    const passwordHash = await hash(temporary, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: accountId },
        data: { passwordHash, passwordChangeRequired: true },
      });
      await tx.session.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.pushSubscription.updateMany({ where: { accountId }, data: { active: false } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          actorRole: actor.role,
          action: 'ACCOUNT_RESET',
          result: 'SUCCESS',
          resourceType: 'UserAccount',
          resourceId: accountId,
          summary: { sessionsRevoked: true },
          reason,
          correlationId: 'admin-reset',
          releaseSha: process.env.RELEASE_SHA ?? 'development',
        },
      });
    });
    return { success: true };
  }
  async setActive(actor: AuthActor, accountId: string, active: boolean, input: unknown) {
    const { reason } = parse(accountAction, input);
    const account = await this.prisma.userAccount.findUnique({ where: { id: accountId } });
    if (!account) throw forbiddenAsNotFound();
    if (
      !active &&
      (account.role === Role.MANAGER ||
        account.role === Role.SECTION_HEAD ||
        account.role === Role.UNION)
    ) {
      const count = await this.prisma.voice.count({
        where: {
          OR: [{ routeOwnerId: accountId }, { currentHandlerId: accountId }],
          status: { in: [VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
        },
      });
      if (count)
        throw conflict('ACTIVE_HANDLER_CONFLICT', 'Account has active Voice ownership', {
          activeVoiceCount: count,
        });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({ where: { id: accountId }, data: { active } });
      if (!active) {
        await tx.session.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.pushSubscription.updateMany({ where: { accountId }, data: { active: false } });
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          actorRole: actor.role,
          action: active ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
          result: 'SUCCESS',
          resourceType: 'UserAccount',
          resourceId: accountId,
          summary: {},
          reason,
          correlationId: 'admin-account',
          releaseSha: process.env.RELEASE_SHA ?? 'development',
        },
      });
    });
    return { success: true };
  }
  searchEmployees(query: string) {
    const value = query.trim();
    if (!value) return [];
    return this.prisma.employee.findMany({
      where: {
        active: true,
        OR: [{ noReg: { startsWith: value } }, { name: { contains: value, mode: 'insensitive' } }],
      },
      take: 20,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        noReg: true,
        name: true,
        division: true,
        department: true,
        account: { select: { id: true, role: true } },
      },
    });
  }
  async promoteSectionHead(actor: AuthActor, input: unknown) {
    const data = parse(sectionHeadAction, input);
    const manager = await this.requireManager(actor.accountId);
    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { account: true, sectionHeads: { where: { active: true } } },
    });
    if (!employee?.active || !employee.account?.active) throw forbiddenAsNotFound();
    if (
      employee.account.role === Role.MANAGER ||
      employee.account.role === Role.UNION ||
      employee.account.role === Role.CARE_ADMIN
    )
      throw conflict(
        'RESPONDER_ROLE_CONFLICT',
        'Employee already has an incompatible responder role',
      );
    if (employee.sectionHeads.length)
      throw conflict('SECTION_HEAD_RELATION_CONFLICT', 'Explicit transfer is required');
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: employee.account!.id },
        data: { role: Role.SECTION_HEAD },
      });
      await tx.sectionHeadRelation.create({
        data: { employeeId: employee.id, managerId: manager.accountId },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          actorRole: actor.role,
          action: 'SECTION_HEAD_PROMOTED',
          result: 'SUCCESS',
          resourceType: 'Employee',
          resourceId: employee.id,
          summary: { managerId: manager.accountId },
          reason: data.reason,
          correlationId: 'section-head',
          releaseSha: process.env.RELEASE_SHA ?? 'development',
        },
      });
    });
    return { success: true };
  }
  async transferSectionHead(actor: AuthActor, input: unknown) {
    const data = parse(transferAction, input);
    await this.requireManager(actor.accountId);
    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { account: true, sectionHeads: { where: { active: true } } },
    });
    if (!employee?.account || employee.sectionHeads[0]?.managerId !== actor.accountId)
      throw forbiddenAsNotFound();
    await this.requireManager(data.targetManagerId);
    const active = await this.prisma.voice.count({
      where: {
        currentHandlerId: employee.account.id,
        status: { in: [VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
      },
    });
    if (active)
      throw conflict('ACTIVE_ASSIGNMENT_CONFLICT', 'Section Head has active assigned Voices', {
        activeVoiceCount: active,
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.sectionHeadRelation.update({
        where: { id: employee.sectionHeads[0]!.id },
        data: { active: false, endedAt: new Date() },
      });
      await tx.sectionHeadRelation.create({
        data: { employeeId: employee.id, managerId: data.targetManagerId },
      });
    });
    return { success: true };
  }
  async removeSectionHead(actor: AuthActor, input: unknown) {
    const data = parse(sectionHeadAction, input);
    await this.requireManager(actor.accountId);
    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { account: true, sectionHeads: { where: { active: true } } },
    });
    if (!employee?.account || employee.sectionHeads[0]?.managerId !== actor.accountId)
      throw forbiddenAsNotFound();
    const active = await this.prisma.voice.count({
      where: {
        currentHandlerId: employee.account.id,
        status: { in: [VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
      },
    });
    if (active)
      throw conflict('ACTIVE_ASSIGNMENT_CONFLICT', 'Section Head has active assigned Voices', {
        activeVoiceCount: active,
      });
    await this.prisma.$transaction([
      this.prisma.sectionHeadRelation.update({
        where: { id: employee.sectionHeads[0]!.id },
        data: { active: false, endedAt: new Date() },
      }),
      this.prisma.userAccount.update({
        where: { id: employee.account.id },
        data: { role: Role.MEMBER },
      }),
    ]);
    return { success: true };
  }
  private async requireManager(accountId: string) {
    const profile = await this.prisma.managerProfile.findUnique({ where: { accountId } });
    if (!profile?.active) throw forbiddenAsNotFound();
    return profile;
  }
}
