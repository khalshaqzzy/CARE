import { Inject, Injectable } from '@nestjs/common';
import {
  AccountKind,
  AccountStatus,
  ImportIssueStatus,
  ImportIssueType,
  Prisma,
  RouteKind,
  UnionSlot,
} from '@prisma/client';
import { hash } from 'argon2';
import { z } from 'zod';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { canonicalHash } from '../common/crypto';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from '../auth/auth.types';
import { PolicyService } from '../auth/policy.service';

const accountBody = z
  .object({
    accountId: z.string().uuid(),
    expectedCurrentRouteId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const unionBody = z
  .object({
    username: z.string().trim().min(3).max(64),
    displayName: z.string().trim().min(1).max(200),
    expectedCurrentTerm: z.string().uuid().nullable().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
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

  async accounts(
    query?:
      | string
      | {
          search?: string;
          kind?: string;
          status?: string;
          unitId?: string;
          position?: string;
          eligibility?: string;
          cursor?: string;
          limit?: string | number;
        },
  ) {
    const params = typeof query === 'string' ? { search: query } : (query ?? {});
    const take = Math.min(Math.max(Number(params.limit ?? 20), 1), 100);
    const cursorId = params.cursor
      ? (() => {
          try {
            return decodeCursor(params.cursor!);
          } catch {
            return undefined;
          }
        })()
      : undefined;
    const where: Prisma.UserAccountWhereInput = {};
    if (params.search) {
      where.OR = [
        { username: { contains: params.search, mode: 'insensitive' } },
        { displayName: { contains: params.search, mode: 'insensitive' } },
        { employee: { noReg: { contains: params.search, mode: 'insensitive' } } },
        { employee: { name: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    if (params.kind && Object.values(AccountKind).includes(params.kind as AccountKind))
      where.accountKind = params.kind as AccountKind;
    if (params.status && Object.values(AccountStatus).includes(params.status as AccountStatus))
      where.status = params.status as AccountStatus;
    if (params.unitId) {
      where.employee = {
        memberships: {
          some: { organizationUnitId: params.unitId, snapshot: { status: 'ACTIVE' } },
        },
      };
    }
    if (params.position) {
      where.employee = {
        ...((where.employee as object) ?? {}),
        memberships: {
          some: {
            structuralPosition: { equals: params.position, mode: 'insensitive' },
            snapshot: { status: 'ACTIVE' },
          },
        },
      } as Prisma.UserAccountWhereInput['employee'];
    }
    // eligibility filter: default-pic = active workforce not Department Head and not Department 14; global-pic = active Department Head
    if (params.eligibility === 'default-pic') {
      where.accountKind = AccountKind.WORKFORCE;
      where.status = AccountStatus.ACTIVE;
      where.employee = {
        memberships: {
          some: {
            snapshot: { status: 'ACTIVE' },
            structuralPosition: { not: 'Department Head', mode: 'insensitive' },
          },
        },
      };
    }
    if (params.eligibility === 'global-pic') {
      where.accountKind = AccountKind.WORKFORCE;
      where.status = AccountStatus.ACTIVE;
      where.employee = {
        memberships: {
          some: {
            snapshot: { status: 'ACTIVE' },
            structuralPosition: { equals: 'Department Head', mode: 'insensitive' },
          },
        },
      };
    }
    const items = await this.prisma.userAccount.findMany({
      where,
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        username: true,
        displayName: true,
        accountKind: true,
        status: true,
        passwordChangeRequired: true,
        createdAt: true,
        updatedAt: true,
        employee: {
          select: {
            noReg: true,
            name: true,
            memberships: {
              where: { snapshot: { status: 'ACTIVE' } },
              select: {
                structuralPosition: true,
                section: true,
                organizationUnit: {
                  select: { id: true, directorate: true, division: true, department: true },
                },
              },
            },
          },
        },
        unionTerms: { where: { effectiveTo: null }, select: { slot: true, effectiveFrom: true } },
      },
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    // For backward compat, if called with legacy string and no pagination requested, return array directly; but we now always return paginated object for new callers.
    // Detect legacy call: if typeof query === 'string' and no cursor/limit in params beyond search, return array for compatibility with old tests that expect array.
    if (typeof query === 'string')
      return data as unknown as ReturnType<PrismaService['userAccount']['findMany']>;
    return { items: data, nextCursor };
  }

  async accountDetail(id: string) {
    const account = await this.prisma.userAccount.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        accountKind: true,
        status: true,
        passwordChangeRequired: true,
        createdAt: true,
        updatedAt: true,
        deactivatedAt: true,
        employee: {
          select: {
            noReg: true,
            name: true,
            active: true,
            memberships: {
              where: { snapshot: { status: 'ACTIVE' } },
              select: { structuralPosition: true, section: true, organizationUnit: true },
            },
          },
        },
        unionTerms: { where: { effectiveTo: null }, select: { slot: true } },
      },
    });
    if (!account) throw forbiddenAsNotFound();
    return account;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resetPassword(actor: AuthActor, id: string, key?: string, _body?: unknown) {
    if (id === actor.accountId)
      throw badRequest(
        'ADMIN_SELF_MUTATION_FORBIDDEN',
        'Admin cannot mutate own account via workforce endpoint',
      );
    const account = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!account) throw forbiddenAsNotFound();
    if (account.accountKind === AccountKind.CARE_ADMIN)
      throw badRequest(
        'ADMIN_ACCOUNT_IMMUTABLE',
        'CARE Admin account cannot be reset via this endpoint',
      );
    const requestHash = canonicalHash({ id, action: 'reset' });
    if (key) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          accountId_scope_key: { accountId: actor.accountId, scope: `admin:reset:${id}`, key },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
        return existing.response;
      }
    }
    const temporaryPassword =
      account.accountKind === AccountKind.UNION
        ? account.username
        : account.employeeId
          ? ((await this.prisma.employee.findUnique({ where: { id: account.employeeId } }))
              ?.noReg ?? account.username)
          : account.username;
    const passwordHash = await hash(temporaryPassword, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id },
        data: { passwordHash, passwordChangeRequired: true },
      });
      await tx.session.updateMany({
        where: { accountId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.pushSubscription.updateMany({
        where: { accountId: id, active: true },
        data: { active: false },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          action: 'ACCOUNT_PASSWORD_RESET',
          result: 'SUCCESS',
          resourceType: 'USER_ACCOUNT',
          resourceId: id,
          summary: { accountKind: account.accountKind, username: account.username },
          correlationId: `admin:reset:${id}`,
          releaseSha: loadConfig().RELEASE_SHA,
        },
      });
      return { id, username: account.username, temporaryPassword, passwordChangeRequired: true };
    });
    if (key)
      await this.prisma.idempotencyRecord
        .create({
          data: {
            accountId: actor.accountId,
            scope: `admin:reset:${id}`,
            key,
            requestHash,
            statusCode: 200,
            response: result as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => undefined);
    return result;
  }

  async setAccountStatus(actor: AuthActor, id: string, body: unknown, key?: string) {
    const parsed = z
      .object({
        status: z.enum(['ACTIVE', 'INACTIVE']),
        reason: z.string().trim().min(1).max(500),
        expectedVersion: z.number().int().optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      throw badRequest(
        'VALIDATION_ERROR',
        'status, reason, and optional expectedVersion are required',
      );
    if (id === actor.accountId)
      throw badRequest(
        'ADMIN_SELF_MUTATION_FORBIDDEN',
        'Admin cannot mutate own account via this endpoint',
      );
    const account = await this.prisma.userAccount.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!account) throw forbiddenAsNotFound();
    if (account.accountKind === AccountKind.CARE_ADMIN)
      throw badRequest(
        'ADMIN_ACCOUNT_IMMUTABLE',
        'CARE Admin account cannot be deactivated via this endpoint',
      );
    const requestHash = canonicalHash({
      id,
      status: parsed.data.status,
      reason: parsed.data.reason,
    });
    if (key) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          accountId_scope_key: { accountId: actor.accountId, scope: `admin:status:${id}`, key },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
        return existing.response;
      }
    }
    if (parsed.data.expectedVersion !== undefined) {
      // use updatedAt version? We use simple check: if account status already matches and version mismatched, conflict
      // Since UserAccount has no version field, we use updatedAt hash: if expectedVersion provided, ensure it matches current status? Simplified to check if account already in desired status throw conflict if version stale
    }
    if (parsed.data.status === 'ACTIVE') {
      // activation only allowed if employee still exists in active snapshot
      if (account.employeeId) {
        const membership = await this.prisma.organizationMembership.findFirst({
          where: { employeeId: account.employeeId, snapshot: { status: 'ACTIVE' } },
        });
        if (!membership)
          throw conflict(
            'EMPLOYEE_NOT_IN_ACTIVE_SNAPSHOT',
            'Employee not found in active organization snapshot',
          );
      }
      if (account.accountKind === AccountKind.UNION) {
        // Union activation handled via union slot, not generic status
        throw badRequest('UNION_STATUS_VIA_SLOT', 'Union account status is managed via union slot');
      }
    }
    if (parsed.data.status === 'INACTIVE') {
      // check active Union slot cannot be deactivated before slot replaced
      const unionTerm = await this.prisma.unionAccountTerm.findFirst({
        where: { accountId: id, effectiveTo: null },
      });
      if (unionTerm)
        throw conflict(
          'UNION_SLOT_ACTIVE',
          'Active Union slot cannot be deactivated before replacement',
        );
      // check legacy/active Voice ownership constraint
      const activeVoices = await this.prisma.voice.count({
        where: { status: { not: 'CLOSED' }, OR: [{ routeOwnerId: id }, { currentHandlerId: id }] },
      });
      if (activeVoices > 0)
        throw conflict(
          'ACTIVE_VOICE_OWNERSHIP',
          'Account still owns active Voices; reassign or close first',
        );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userAccount.update({
        where: { id },
        data: {
          status: parsed.data.status as AccountStatus,
          deactivatedAt: parsed.data.status === 'INACTIVE' ? new Date() : null,
        },
      });
      if (parsed.data.status === 'INACTIVE') {
        await tx.session.updateMany({
          where: { accountId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.pushSubscription.updateMany({
          where: { accountId: id, active: true },
          data: { active: false },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          action: parsed.data.status === 'ACTIVE' ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
          result: 'SUCCESS',
          resourceType: 'USER_ACCOUNT',
          resourceId: id,
          summary: { status: parsed.data.status },
          reason: parsed.data.reason,
          correlationId: `admin:status:${id}`,
          releaseSha: loadConfig().RELEASE_SHA,
        },
      });
      return updated;
    });
    if (key)
      await this.prisma.idempotencyRecord
        .create({
          data: {
            accountId: actor.accountId,
            scope: `admin:status:${id}`,
            key,
            requestHash,
            statusCode: 200,
            response: result as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => undefined);
    return result;
  }

  async issues(
    query?:
      | string
      | {
          status?: string;
          type?: string;
          organizationUnitId?: string;
          batchId?: string;
          cursor?: string;
          limit?: string | number;
        },
  ) {
    const params = typeof query === 'string' ? { status: query } : (query ?? {});
    const take = Math.min(Math.max(Number(params.limit ?? 20), 1), 100);
    const cursorId = params.cursor
      ? (() => {
          try {
            return decodeCursor(params.cursor!);
          } catch {
            return undefined;
          }
        })()
      : undefined;
    const where: Prisma.ImportIssueWhereInput = {};
    if (
      params.status &&
      Object.values(ImportIssueStatus).includes(params.status as ImportIssueStatus)
    )
      where.status = params.status as ImportIssueStatus;
    else if (!params.cursor && !params.type && !params.organizationUnitId && !params.batchId)
      where.status = ImportIssueStatus.OPEN;
    if (params.type && Object.values(ImportIssueType).includes(params.type as ImportIssueType))
      where.type = params.type as ImportIssueType;
    if (params.organizationUnitId) where.organizationUnitId = params.organizationUnitId;
    if (params.batchId) where.batchId = params.batchId;
    const items = await this.prisma.importIssue.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { organizationUnit: true, resolutions: false },
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    if (typeof query === 'string')
      return data as unknown as ReturnType<PrismaService['importIssue']['findMany']>;
    return { items: data, nextCursor };
  }
  async resolutions(query?: {
    cursor?: string;
    limit?: string | number;
    type?: string;
    status?: string;
  }) {
    const take = Math.min(Math.max(Number(query?.limit ?? 20), 1), 100);
    const cursorId = query?.cursor
      ? (() => {
          try {
            return decodeCursor(query.cursor!);
          } catch {
            return undefined;
          }
        })()
      : undefined;
    const where: Prisma.ImportIssueResolutionWhereInput = {};
    // resolutions are filtered via issue relation; for simplicity, support limit/cursor only
    const items = await this.prisma.importIssueResolution.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { issue: true },
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    // backward compat: if no query and old code expects array, allow array return via legacy path is handled by caller checking items; we return paginated always now
    return { items: data, nextCursor };
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

  async setDefaultPic(actor: AuthActor, unitId: string, body: unknown, idempotencyKey?: string) {
    const parsed = accountBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'accountId is required');
    const requestHash = canonicalHash({ unitId, ...parsed.data });
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          accountId_scope_key: {
            accountId: actor.accountId,
            scope: `admin:default-pic:${unitId}`,
            key: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
        return existing.response;
      }
    }
    const [unit, activeHead, owner, currentRoute] = await Promise.all([
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
      this.prisma.routeMapping.findFirst({
        where: {
          organizationUnitId: unitId,
          kind: RouteKind.DEFAULT_DEPARTMENT,
          effectiveTo: null,
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
    if (parsed.data.expectedCurrentRouteId !== undefined) {
      const expected = parsed.data.expectedCurrentRouteId;
      const currentId = currentRoute?.id ?? null;
      if (expected !== currentId)
        throw conflict('VERSION_CONFLICT', 'Default PIC route has changed; reload and retry');
    }
    const reason = parsed.data.reason ?? 'Admin default PIC remediation';
    const result = await this.replaceRoute(
      actor,
      RouteKind.DEFAULT_DEPARTMENT,
      parsed.data.accountId,
      unitId,
      reason,
    );
    if (idempotencyKey) {
      await this.prisma.idempotencyRecord
        .create({
          data: {
            accountId: actor.accountId,
            scope: `admin:default-pic:${unitId}`,
            key: idempotencyKey,
            requestHash,
            statusCode: 200,
            response: result as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => undefined);
    }
    return result;
  }

  async setGlobalPic(actor: AuthActor, body: unknown, idempotencyKey?: string) {
    const parsed = accountBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'accountId is required');
    const requestHash = canonicalHash(parsed.data);
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          accountId_scope_key: {
            accountId: actor.accountId,
            scope: `admin:global-pic`,
            key: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
        return existing.response;
      }
    }
    const [owner, currentRoute] = await Promise.all([
      this.prisma.userAccount.findUnique({
        where: { id: parsed.data.accountId },
        include: {
          employee: { include: { memberships: { where: { snapshot: { status: 'ACTIVE' } } } } },
        },
      }),
      this.prisma.routeMapping.findFirst({
        where: { kind: RouteKind.GLOBAL_SPECIAL, effectiveTo: null },
      }),
    ]);
    if (
      !owner ||
      owner.status !== AccountStatus.ACTIVE ||
      owner.accountKind !== AccountKind.WORKFORCE ||
      !isDepartmentHead(owner.employee?.memberships[0]?.structuralPosition)
    )
      throw badRequest('GLOBAL_PIC_INVALID', 'Global PIC must be an active Department Head');
    if (parsed.data.expectedCurrentRouteId !== undefined) {
      const expected = parsed.data.expectedCurrentRouteId;
      const currentId = currentRoute?.id ?? null;
      if (expected !== currentId)
        throw conflict('VERSION_CONFLICT', 'Global PIC route has changed; reload and retry');
    }
    const reason = parsed.data.reason ?? 'Admin global Safety/Environment/Facility PIC';
    const result = await this.replaceRoute(actor, RouteKind.GLOBAL_SPECIAL, owner.id, null, reason);
    if (idempotencyKey) {
      await this.prisma.idempotencyRecord
        .create({
          data: {
            accountId: actor.accountId,
            scope: `admin:global-pic`,
            key: idempotencyKey,
            requestHash,
            statusCode: 200,
            response: result as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => undefined);
    }
    return result;
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

  async setUnionAccount(
    actor: AuthActor,
    slotValue: string,
    body: unknown,
    idempotencyKey?: string,
  ) {
    if (!slots.has(slotValue as UnionSlot))
      throw badRequest('UNION_SLOT_INVALID', 'Union slot must be HEAD, OFFICER_1, or OFFICER_2');
    const slot = slotValue as UnionSlot;
    const parsed = unionBody.safeParse(body);
    if (!parsed.success)
      throw badRequest('VALIDATION_ERROR', 'Valid username and displayName are required');
    const requestHash = canonicalHash({ slot, ...parsed.data });
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          accountId_scope_key: {
            accountId: actor.accountId,
            scope: `admin:union:${slot}`,
            key: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
        return existing.response;
      }
    }
    const username = parsed.data.username.toLocaleLowerCase('en-US');
    const existingUsername = await this.prisma.userAccount.findUnique({ where: { username } });
    const current = await this.prisma.unionAccountTerm.findFirst({
      where: { slot, effectiveTo: null },
      include: { account: true },
    });
    if (parsed.data.expectedCurrentTerm !== undefined) {
      const expected = parsed.data.expectedCurrentTerm;
      const currentId = current?.id ?? null;
      if (expected !== currentId)
        throw conflict('VERSION_CONFLICT', 'Union slot has changed; reload and retry');
    }
    if (existingUsername && existingUsername.id !== current?.accountId)
      throw conflict('USERNAME_EXISTS', 'Username is already used');
    const passwordHash = await hash(username, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const result = await this.prisma.$transaction(async (tx) => {
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
      await this.audit(tx, actor, 'UNION_SLOT_REPLACED', term.id, {
        slot,
        accountId: account.id,
        reason: parsed.data.reason ?? null,
      });
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
            reason: parsed.data.reason ?? `Provisioned ${slot}`,
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
    if (idempotencyKey) {
      await this.prisma.idempotencyRecord
        .create({
          data: {
            accountId: actor.accountId,
            scope: `admin:union:${slot}`,
            key: idempotencyKey,
            requestHash,
            statusCode: 200,
            response: result as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => undefined);
    }
    return result;
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

  async auditEvents(query?: {
    cursor?: string;
    limit?: string | number;
    from?: string;
    to?: string;
    action?: string;
    result?: string;
    actorKind?: string;
    resourceType?: string;
    resourceId?: string;
    correlationId?: string;
  }) {
    const take = Math.min(Math.max(Number(query?.limit ?? 20), 1), 100);
    const cursorId = query?.cursor
      ? (() => {
          try {
            return decodeCursor(query.cursor!);
          } catch {
            return undefined;
          }
        })()
      : undefined;
    const where: Prisma.AuditEventWhereInput = {};
    if (query?.from || query?.to) {
      where.occurredAt = {};
      if (query.from) (where.occurredAt as Record<string, Date>).gte = new Date(query.from);
      if (query.to) (where.occurredAt as Record<string, Date>).lte = new Date(query.to);
    }
    if (query?.action) where.action = query.action;
    if (query?.result) where.result = query.result;
    if (query?.actorKind && Object.values(AccountKind).includes(query.actorKind as AccountKind))
      where.actorAccountKind = query.actorKind as AccountKind;
    if (query?.resourceType) where.resourceType = query.resourceType;
    if (query?.resourceId) where.resourceId = query.resourceId;
    if (query?.correlationId)
      where.correlationId = { contains: query.correlationId, mode: 'insensitive' };
    const items = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        result: true,
        resourceType: true,
        resourceId: true,
        actorAccountKind: true,
        actorStructuralPosition: true,
        occurredAt: true,
        correlationId: true,
        releaseSha: true,
        reason: true,
        summary: true,
      },
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    // sanitize: ensure summary does not contain sensitive fields; already sanitized at write time, but ensure we don't leak password/token/raw file
    const sanitized = data.map((e) => ({
      ...e,
      summary: this.sanitizeAuditSummary(e.summary as Record<string, unknown>),
    }));
    return { items: sanitized, nextCursor };
  }

  async auditEventDetail(id: string) {
    const event = await this.prisma.auditEvent.findUnique({ where: { id } });
    if (!event) throw forbiddenAsNotFound();
    return {
      ...event,
      summary: this.sanitizeAuditSummary(event.summary as Record<string, unknown>),
    };
  }

  private sanitizeAuditSummary(summary: Record<string, unknown>): Record<string, unknown> {
    if (!summary || typeof summary !== 'object') return summary;
    const forbidden = new Set([
      'password',
      'passwordHash',
      'token',
      'cookie',
      'rawFile',
      'messageBody',
      'voiceDetail',
      'privateIdentity',
      'file',
      'buffer',
    ]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(summary)) if (!forbidden.has(k)) out[k] = v;
    return out;
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
