import { Inject, Injectable } from '@nestjs/common';
import {
  AccountKind,
  AccountStatus,
  ImportIssueStatus,
  Prisma,
  RouteKind,
  UnionSlot,
} from '@prisma/client';
import { hash } from 'argon2';
import { z } from 'zod';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from '../auth/auth.types';
import { PolicyService } from '../auth/policy.service';

const accountBody = z.object({ accountId: z.string().uuid() }).strict();
const unionBody = z
  .object({
    username: z.string().trim().min(3).max(64),
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();
const slots = new Set(Object.values(UnionSlot));
const isDepartmentHead = (value?: string | null) =>
  value?.trim().toLocaleLowerCase('en-US') === 'department head';

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}

  accounts(search?: string) {
    return this.prisma.userAccount.findMany({
      where: search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { username: 'asc' },
      take: 200,
      select: {
        id: true,
        username: true,
        displayName: true,
        accountKind: true,
        status: true,
        employee: {
          select: {
            noReg: true,
            memberships: {
              where: { snapshot: { status: 'ACTIVE' } },
              select: { structuralPosition: true, section: true, organizationUnit: true },
            },
          },
        },
        unionTerms: { where: { effectiveTo: null }, select: { slot: true } },
      },
    });
  }
  issues(status?: string) {
    const parsed =
      status && Object.values(ImportIssueStatus).includes(status as ImportIssueStatus)
        ? (status as ImportIssueStatus)
        : ImportIssueStatus.OPEN;
    return this.prisma.importIssue.findMany({
      where: { status: parsed },
      include: { organizationUnit: true, resolutions: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  resolutions() {
    return this.prisma.importIssueResolution.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { issue: true },
    });
  }

  async sectionHeadCandidates(unitId: string) {
    const unit = await this.prisma.organizationUnit.findUnique({ where: { id: unitId } });
    if (!unit) throw forbiddenAsNotFound();
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationUnitId: unitId,
        snapshot: { status: 'ACTIVE' },
        employee: { active: true, account: { status: AccountStatus.ACTIVE } },
      },
      select: {
        employeeName: true,
        section: true,
        structuralPosition: true,
        employee: { select: { noReg: true, account: { select: { id: true, username: true } } } },
      },
    });
    return memberships.filter(
      (membership) =>
        membership.structuralPosition.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') ===
        'section head',
    );
  }

  async setDefaultPic(actor: AuthActor, unitId: string, body: unknown) {
    const parsed = accountBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'accountId is required');
    const [unit, activeHead, owner] = await Promise.all([
      this.prisma.organizationUnit.findUnique({ where: { id: unitId } }),
      this.prisma.routeMapping.findFirst({
        where: { organizationUnitId: unitId, kind: RouteKind.DEPARTMENT_HEAD, effectiveTo: null },
      }),
      this.prisma.userAccount.findUnique({
        where: { id: parsed.data.accountId },
        include: {
          employee: { include: { memberships: { where: { snapshot: { status: 'ACTIVE' } } } } },
        },
      }),
    ]);
    if (
      !unit ||
      !owner ||
      owner.accountKind !== AccountKind.WORKFORCE ||
      owner.status !== AccountStatus.ACTIVE ||
      !owner.employee?.memberships.length
    )
      throw forbiddenAsNotFound();
    if (unit.department === '14')
      throw conflict('GENERAL_ROUTE_FORBIDDEN', 'Department 14 cannot have a General route');
    if (activeHead)
      throw conflict(
        'DEPARTMENT_HEAD_EXISTS',
        'Default PIC is only allowed when no active Department Head exists',
      );
    return this.replaceRoute(
      actor,
      RouteKind.DEFAULT_DEPARTMENT,
      parsed.data.accountId,
      unitId,
      'Admin default PIC remediation',
    );
  }

  async setGlobalPic(actor: AuthActor, body: unknown) {
    const parsed = accountBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'accountId is required');
    const owner = await this.prisma.userAccount.findUnique({
      where: { id: parsed.data.accountId },
      include: {
        employee: { include: { memberships: { where: { snapshot: { status: 'ACTIVE' } } } } },
      },
    });
    if (
      !owner ||
      owner.status !== AccountStatus.ACTIVE ||
      owner.accountKind !== AccountKind.WORKFORCE ||
      !isDepartmentHead(owner.employee?.memberships[0]?.structuralPosition)
    )
      throw badRequest('GLOBAL_PIC_INVALID', 'Global PIC must be an active Department Head');
    return this.replaceRoute(
      actor,
      RouteKind.GLOBAL_SPECIAL,
      owner.id,
      null,
      'Admin global Safety/Environment/Facility PIC',
    );
  }

  unionAccounts() {
    return this.prisma.unionAccountTerm.findMany({
      where: { effectiveTo: null },
      include: {
        account: { select: { id: true, username: true, displayName: true, status: true } },
      },
      orderBy: { slot: 'asc' },
    });
  }

  async setUnionAccount(actor: AuthActor, slotValue: string, body: unknown) {
    if (!slots.has(slotValue as UnionSlot))
      throw badRequest('UNION_SLOT_INVALID', 'Union slot must be HEAD, OFFICER_1, or OFFICER_2');
    const slot = slotValue as UnionSlot;
    const parsed = unionBody.safeParse(body);
    if (!parsed.success)
      throw badRequest('VALIDATION_ERROR', 'Valid username and displayName are required');
    const username = parsed.data.username.toLocaleLowerCase('en-US');
    const existingUsername = await this.prisma.userAccount.findUnique({ where: { username } });
    const current = await this.prisma.unionAccountTerm.findFirst({
      where: { slot, effectiveTo: null },
      include: { account: true },
    });
    if (existingUsername && existingUsername.id !== current?.accountId)
      throw conflict('USERNAME_EXISTS', 'Username is already used');
    const passwordHash = await hash(username, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    return this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.unionAccountTerm.update({
          where: { id: current.id },
          data: { effectiveTo: new Date() },
        });
        const activeVoices = await tx.voice.findMany({
          where: {
            status: { not: 'CLOSED' },
            OR: [{ routeOwnerId: current.accountId }, { currentHandlerId: current.accountId }],
          },
          select: { id: true },
        });
        if (activeVoices.length)
          await tx.legacyVoiceAccess.createMany({
            data: activeVoices.map((voice) => ({
              voiceId: voice.id,
              accountId: current.accountId,
              reason: 'UNION_SLOT_REPLACED',
            })),
            skipDuplicates: true,
          });
        await tx.userAccount.update({
          where: { id: current.accountId },
          data: {
            status: activeVoices.length ? AccountStatus.LEGACY_HANDLER : AccountStatus.INACTIVE,
            deactivatedAt: new Date(),
          },
        });
        await tx.session.updateMany({
          where: { accountId: current.accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      const account = existingUsername
        ? await tx.userAccount.update({
            where: { id: existingUsername.id },
            data: {
              accountKind: AccountKind.UNION,
              status: AccountStatus.ACTIVE,
              displayName: parsed.data.displayName,
              passwordHash,
              passwordChangeRequired: true,
              deactivatedAt: null,
            },
          })
        : await tx.userAccount.create({
            data: {
              username,
              displayName: parsed.data.displayName,
              passwordHash,
              accountKind: AccountKind.UNION,
            },
          });
      const term = await tx.unionAccountTerm.create({ data: { accountId: account.id, slot } });
      await this.audit(tx, actor, 'UNION_SLOT_REPLACED', term.id, { slot, accountId: account.id });
      const issues = await tx.importIssue.findMany({
        where: {
          status: ImportIssueStatus.OPEN,
          type: slot === UnionSlot.HEAD ? 'UNION_HEAD_MISSING' : 'UNION_OFFICER_MISSING',
        },
      });
      for (const issue of issues) {
        const details = issue.details as { slot?: string };
        if (slot !== UnionSlot.HEAD && details.slot !== slot) continue;
        await tx.importIssue.update({
          where: { id: issue.id },
          data: { status: ImportIssueStatus.RESOLVED, resolvedAt: new Date() },
        });
        await tx.importIssueResolution.create({
          data: {
            issueId: issue.id,
            actorId: actor.accountId,
            action: 'UNION_SLOT_PROVISIONED',
            reason: `Provisioned ${slot}`,
            details: { accountId: account.id, slot },
          },
        });
      }
      return {
        slot,
        account: { id: account.id, username: account.username, displayName: account.displayName },
        temporaryPassword: username,
        passwordChangeRequired: true,
      };
    });
  }

  private async replaceRoute(
    actor: AuthActor,
    kind: RouteKind,
    ownerAccountId: string,
    organizationUnitId: string | null,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.routeMapping.updateMany({
        where: { kind, organizationUnitId, effectiveTo: null },
        data: { effectiveTo: new Date() },
      });
      const route = await tx.routeMapping.create({
        data: { kind, organizationUnitId, ownerAccountId, createdById: actor.accountId, reason },
      });
      await this.audit(tx, actor, 'ROUTE_MAPPING_CHANGED', route.id, {
        kind,
        organizationUnitId,
        ownerAccountId,
      });
      const issueTypes =
        kind === RouteKind.GLOBAL_SPECIAL
          ? (['INVALID_GLOBAL_PIC'] as const)
          : (['MISSING_DEPARTMENT_HEAD', 'INVALID_DEFAULT_PIC'] as const);
      const issues = await tx.importIssue.findMany({
        where: {
          status: ImportIssueStatus.OPEN,
          type: { in: [...issueTypes] },
          ...(organizationUnitId ? { organizationUnitId } : {}),
        },
      });
      for (const issue of issues) {
        await tx.importIssue.update({
          where: { id: issue.id },
          data: { status: ImportIssueStatus.RESOLVED, resolvedAt: new Date() },
        });
        await tx.importIssueResolution.create({
          data: {
            issueId: issue.id,
            actorId: actor.accountId,
            action: 'ROUTE_PIC_ASSIGNED',
            reason,
            details: { routeMappingId: route.id, ownerAccountId },
          },
        });
      }
      return route;
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    action: string,
    resourceId: string,
    summary: object,
  ) {
    return tx.auditEvent.create({
      data: {
        actorId: actor.accountId,
        ...this.policy.actorSnapshot(actor),
        action,
        result: 'SUCCESS',
        resourceType: 'ADMIN_CONFIGURATION',
        resourceId,
        summary,
        correlationId: `admin:${resourceId}`,
        releaseSha: loadConfig().RELEASE_SHA,
      },
    });
  }
}
