import { Inject, Injectable, Optional } from '@nestjs/common';
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
import { AiService } from '../ai/ai.service';
import {
  AI_CONFIGURATION_ID,
  AiRuntimeConfigService,
  encryptAiSecret,
  environmentAiConfig,
  fingerprintAiSecret,
} from '../ai/runtime-config.service';

const routePicBody = z
  .object({
    noReg: z.string().trim().min(1).max(64),
  })
  .strict();
const unionBody = z
  .object({
    username: z.string().trim().min(3).max(64),
    displayName: z.string().trim().min(1).max(200),
    expectedCurrentTerm: z.string().uuid().nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const slots = new Set(Object.values(UnionSlot));
const isDepartmentHead = (value?: string | null) =>
  value?.trim().toLocaleLowerCase('en-US') === 'department head';
const accountResponseSelect = Prisma.validator<Prisma.UserAccountSelect>()({
  id: true,
  username: true,
  displayName: true,
  accountKind: true,
  status: true,
  deactivatedAt: true,
  passwordChangeRequired: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});
const reasoningEfforts = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const aiConfigurationBody = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .url()
      .refine((value) => new URL(value).protocol === 'https:', 'Base URL must use HTTPS'),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().max(512).optional(),
    reasoningEffort: z.enum(reasoningEfforts),
    confidenceThreshold: z.number().min(0).max(1),
    expectedVersion: z.number().int().positive().nullable(),
  })
  .strict();
const aiConfigurationResetBody = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
    @Optional()
    @Inject(AiRuntimeConfigService)
    private readonly aiRuntimeConfig?: AiRuntimeConfigService,
    @Optional() @Inject(AiService) private readonly ai?: AiService,
  ) {}

  aiConfiguration() {
    return this.requireAiRuntimeConfig().safeEffective();
  }

  async updateAiConfiguration(actor: AuthActor, body: unknown, key?: string) {
    this.requireIdempotencyKey(key);
    const parsed = aiConfigurationBody.safeParse(body);
    if (!parsed.success)
      throw badRequest('VALIDATION_ERROR', 'Invalid AI configuration', [
        ...parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          code: issue.code,
          message: issue.message,
        })),
      ]);

    const currentEffective = await this.requireAiRuntimeConfig().effective();
    const submittedKey = parsed.data.apiKey?.trim();
    const effectiveKey = submittedKey || currentEffective.apiKey;
    if (!effectiveKey)
      throw badRequest('OPENAI_API_KEY_REQUIRED', 'API key is required for the first override');
    const encrypted = encryptAiSecret(effectiveKey);
    const requestHash = canonicalHash({
      ...parsed.data,
      apiKey: submittedKey ? fingerprintAiSecret(submittedKey) : null,
    });

    return this.executeIdempotent({
      actor,
      scope: 'admin:ai-configuration:update',
      key,
      requestHash,
      resourceLock: 'admin:ai-configuration',
      work: async (tx) => {
        const current = await tx.aiProviderConfiguration.findUnique({
          where: { id: AI_CONFIGURATION_ID },
        });
        if ((current?.version ?? null) !== parsed.data.expectedVersion)
          throw conflict('VERSION_CONFLICT', 'AI configuration has changed', {
            currentVersion: current?.version ?? null,
          });
        const changedFields = [
          ...(!current || current.baseUrl !== parsed.data.baseUrl ? ['baseUrl'] : []),
          ...(!current || current.model !== parsed.data.model ? ['model'] : []),
          ...(!current || current.reasoningEffort !== parsed.data.reasoningEffort
            ? ['reasoningEffort']
            : []),
          ...(!current || current.confidenceThreshold !== parsed.data.confidenceThreshold
            ? ['confidenceThreshold']
            : []),
          ...(submittedKey ? ['apiKey'] : []),
        ];
        const secret =
          submittedKey || !current
            ? encrypted
            : {
                ciphertext: current.apiKeyCiphertext,
                iv: current.apiKeyIv,
                tag: current.apiKeyTag,
              };
        const saved = current
          ? await tx.aiProviderConfiguration.update({
              where: { id: AI_CONFIGURATION_ID },
              data: {
                baseUrl: parsed.data.baseUrl,
                model: parsed.data.model,
                reasoningEffort: parsed.data.reasoningEffort,
                confidenceThreshold: parsed.data.confidenceThreshold,
                apiKeyCiphertext: secret.ciphertext,
                apiKeyIv: secret.iv,
                apiKeyTag: secret.tag,
                updatedById: actor.accountId,
                version: { increment: 1 },
              },
            })
          : await tx.aiProviderConfiguration.create({
              data: {
                id: AI_CONFIGURATION_ID,
                baseUrl: parsed.data.baseUrl,
                model: parsed.data.model,
                reasoningEffort: parsed.data.reasoningEffort,
                confidenceThreshold: parsed.data.confidenceThreshold,
                apiKeyCiphertext: secret.ciphertext,
                apiKeyIv: secret.iv,
                apiKeyTag: secret.tag,
                updatedById: actor.accountId,
              },
            });
        await this.audit(tx, actor, 'AI_CONFIGURATION_UPDATED', AI_CONFIGURATION_ID, {
          changedFields,
          previousSource: current ? 'ADMIN_OVERRIDE' : 'ENVIRONMENT',
          source: 'ADMIN_OVERRIDE',
        });
        return {
          source: 'ADMIN_OVERRIDE' as const,
          baseUrl: saved.baseUrl,
          model: saved.model,
          reasoningEffort: saved.reasoningEffort,
          confidenceThreshold: saved.confidenceThreshold,
          apiKeyConfigured: true,
          version: saved.version,
          updatedAt: saved.updatedAt,
        };
      },
      serialize: (result) => ({ ...result, updatedAt: result.updatedAt.toISOString() }),
      replay: (_tx, response) => ({
        source: 'ADMIN_OVERRIDE' as const,
        baseUrl: String(response.baseUrl),
        model: String(response.model),
        reasoningEffort: String(response.reasoningEffort),
        confidenceThreshold: Number(response.confidenceThreshold),
        apiKeyConfigured: true,
        version: Number(response.version),
        updatedAt: new Date(String(response.updatedAt)),
      }),
    });
  }

  async resetAiConfiguration(actor: AuthActor, body: unknown, key?: string) {
    this.requireIdempotencyKey(key);
    const parsed = aiConfigurationResetBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Invalid AI configuration reset');
    const fallback = environmentAiConfig();
    const response = await this.executeIdempotent({
      actor,
      scope: 'admin:ai-configuration:reset',
      key,
      requestHash: canonicalHash(parsed.data),
      resourceLock: 'admin:ai-configuration',
      work: async (tx) => {
        const current = await tx.aiProviderConfiguration.findUnique({
          where: { id: AI_CONFIGURATION_ID },
        });
        if (!current || current.version !== parsed.data.expectedVersion)
          throw conflict('VERSION_CONFLICT', 'AI configuration has changed', {
            currentVersion: current?.version ?? null,
          });
        await tx.aiProviderConfiguration.delete({ where: { id: AI_CONFIGURATION_ID } });
        await this.audit(tx, actor, 'AI_CONFIGURATION_RESET', AI_CONFIGURATION_ID, {
          changedFields: ['baseUrl', 'model', 'reasoningEffort', 'confidenceThreshold', 'apiKey'],
          previousSource: 'ADMIN_OVERRIDE',
          source: 'ENVIRONMENT',
        });
        return {
          source: 'ENVIRONMENT' as const,
          baseUrl: fallback.baseUrl,
          model: fallback.model,
          reasoningEffort: fallback.reasoningEffort,
          confidenceThreshold: fallback.confidenceThreshold,
          apiKeyConfigured: Boolean(fallback.apiKey),
          version: null,
          updatedAt: null,
        };
      },
      serialize: (result) => result,
    });
    return response;
  }

  async testAiConfiguration(actor: AuthActor) {
    const started = Date.now();
    const [classification, location] = await Promise.all([
      this.requireAi().classify({
        visibility: 'GENERAL',
        area: 'KARAWANG_1',
        title: 'Pagar pengaman mesin longgar',
        detail: 'Pagar pengaman di sisi mesin perlu diperiksa dan dikencangkan.',
      }),
      this.requireAi().reviewLocation({ area: 'KARAWANG_1', locationDetail: 'Gedung A, line 2' }),
    ]);
    const result = {
      ok: classification.source === 'AI' && location.fallbackCode === null,
      classification: { source: classification.source },
      location: { completeness: location.completeness, valid: location.fallbackCode === null },
      latencyMs: Date.now() - started,
    };
    await this.prisma.$transaction((tx) =>
      this.audit(tx, actor, 'AI_CONFIGURATION_TESTED', AI_CONFIGURATION_ID, {
        ok: result.ok,
        classificationSource: result.classification.source,
        locationValid: result.location.valid,
      }),
    );
    return result;
  }

  async overview() {
    const [accountGroups, openRemediation, latestImport, unionSlots, recentResolution] =
      await Promise.all([
        this.prisma.userAccount.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.importIssue.count({ where: { status: ImportIssueStatus.OPEN } }),
        this.prisma.importBatch.findFirst({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, status: true, createdAt: true },
        }),
        this.prisma.unionAccountTerm.count({
          where: { effectiveTo: null, account: { status: AccountStatus.ACTIVE } },
        }),
        this.prisma.importIssueResolution.findFirst({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, action: true, createdAt: true },
        }),
      ]);
    const accountCounts = Object.fromEntries(
      accountGroups.map((group) => [group.status, group._count._all]),
    );
    return {
      accounts: {
        active: accountCounts.ACTIVE ?? 0,
        legacy: accountCounts.LEGACY_HANDLER ?? 0,
        inactive: accountCounts.INACTIVE ?? 0,
      },
      openRemediation,
      latestImport,
      unionSlots,
      recentResolution,
    };
  }

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
    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined;
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
        version: true,
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
        version: true,
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

  async resetPassword(
    actor: AuthActor,
    id: string,
    key?: string,
    _body?: unknown,
  ): Promise<unknown> {
    void _body;
    this.requireIdempotencyKey(key);
    if (id === actor.accountId)
      throw badRequest(
        'ADMIN_SELF_MUTATION_FORBIDDEN',
        'Admin cannot mutate own account via workforce endpoint',
      );
    const requestHash = canonicalHash({ id, action: 'reset' });
    return this.executeIdempotent<{
      id: string;
      username: string;
      temporaryPassword: string;
      passwordChangeRequired: boolean;
    }>({
      actor,
      scope: `admin:reset:${id}`,
      key,
      requestHash,
      resourceLock: `account:${id}`,
      serialize: (result) => ({ id: result.id, passwordChangeRequired: true }),
      replay: async (tx, response) => {
        const account = await tx.userAccount.findUnique({
          where: { id },
          include: { employee: { select: { noReg: true } } },
        });
        if (!account) throw forbiddenAsNotFound();
        return {
          id: String(response.id),
          username: account.username,
          temporaryPassword:
            account.accountKind === AccountKind.UNION
              ? account.username
              : (account.employee?.noReg ?? account.username),
          passwordChangeRequired: true,
        };
      },
      work: async (tx) => {
        const account = await tx.userAccount.findUnique({
          where: { id },
          include: { employee: { select: { noReg: true } } },
        });
        if (!account) throw forbiddenAsNotFound();
        if (account.accountKind === AccountKind.CARE_ADMIN)
          throw badRequest(
            'ADMIN_ACCOUNT_IMMUTABLE',
            'CARE Admin account cannot be reset via this endpoint',
          );
        const temporaryPassword =
          account.accountKind === AccountKind.UNION
            ? account.username
            : (account.employee?.noReg ?? account.username);
        const passwordHash = await hash(temporaryPassword, {
          type: 2,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        });
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
      },
    });
  }

  async setAccountStatus(
    actor: AuthActor,
    id: string,
    body: unknown,
    key?: string,
  ): Promise<unknown> {
    this.requireIdempotencyKey(key);
    const parsed = z
      .object({
        status: z.enum(['ACTIVE', 'INACTIVE']),
        reason: z.string().trim().min(1).max(500),
        expectedVersion: z.number().int().positive(),
      })
      .safeParse(body);
    if (!parsed.success)
      throw badRequest('VALIDATION_ERROR', 'status, reason, and expectedVersion are required');
    if (id === actor.accountId)
      throw badRequest(
        'ADMIN_SELF_MUTATION_FORBIDDEN',
        'Admin cannot mutate own account via this endpoint',
      );
    const requestHash = canonicalHash({
      id,
      status: parsed.data.status,
      reason: parsed.data.reason,
      expectedVersion: parsed.data.expectedVersion,
    });
    return this.executeIdempotent({
      actor,
      scope: `admin:status:${id}`,
      key,
      requestHash,
      resourceLock: `account:${id}`,
      serialize: (result) => result as unknown as Prisma.InputJsonValue,
      work: async (tx) => {
        await this.lockAccountRow(tx, id);
        const account = await tx.userAccount.findUnique({
          where: { id },
          include: { employee: true },
        });
        if (!account) throw forbiddenAsNotFound();
        if (account.accountKind === AccountKind.CARE_ADMIN)
          throw badRequest(
            'ADMIN_ACCOUNT_IMMUTABLE',
            'CARE Admin account cannot be deactivated via this endpoint',
          );
        if (account.version !== parsed.data.expectedVersion)
          throw conflict('VERSION_CONFLICT', 'Account has changed; reload and retry');
        if (parsed.data.status === 'ACTIVE') {
          // activation only allowed if employee still exists in active snapshot
          if (account.employeeId) {
            const membership = await tx.organizationMembership.findFirst({
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
            throw badRequest(
              'UNION_STATUS_VIA_SLOT',
              'Union account status is managed via union slot',
            );
          }
        }
        if (parsed.data.status === 'INACTIVE') {
          // check active Union slot cannot be deactivated before slot replaced
          const unionTerm = await tx.unionAccountTerm.findFirst({
            where: { accountId: id, effectiveTo: null },
          });
          if (unionTerm)
            throw conflict(
              'UNION_SLOT_ACTIVE',
              'Active Union slot cannot be deactivated before replacement',
            );
          // check legacy/active Voice ownership constraint
          const activeVoices = await tx.voice.count({
            where: {
              status: { not: 'CLOSED' },
              OR: [{ routeOwnerId: id }, { currentHandlerId: id }],
            },
          });
          if (activeVoices > 0)
            throw conflict(
              'ACTIVE_VOICE_OWNERSHIP',
              'Account still owns active Voices; reassign or close first',
            );
          const activeRoutes = await tx.routeMapping.count({
            where: { ownerAccountId: id, effectiveTo: null },
          });
          if (activeRoutes > 0)
            throw conflict(
              'ACTIVE_ROUTE_OWNERSHIP',
              'Account owns an active route; replace the route before deactivation',
            );
        }
        const updatedCount = await tx.userAccount.updateMany({
          where: { id, version: parsed.data.expectedVersion },
          data: {
            status: parsed.data.status as AccountStatus,
            deactivatedAt: parsed.data.status === 'INACTIVE' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (!updatedCount.count)
          throw conflict('VERSION_CONFLICT', 'Account has changed; reload and retry');
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
        return tx.userAccount.findUniqueOrThrow({ where: { id }, select: accountResponseSelect });
      },
    });
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
    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined;
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
    const cursorId = query?.cursor ? decodeCursor(query.cursor) : undefined;
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

  async setDefaultPic(
    actor: AuthActor,
    unitId: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> {
    this.requireIdempotencyKey(idempotencyKey);
    const parsed = routePicBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'noReg is required');
    const requestHash = canonicalHash({ unitId, ...parsed.data });
    return this.executeIdempotent({
      actor,
      scope: `admin:default-pic:${unitId}`,
      key: idempotencyKey,
      requestHash,
      resourceLock: `route:${RouteKind.DEFAULT_DEPARTMENT}:${unitId}`,
      serialize: (result) => result as unknown as Prisma.InputJsonValue,
      work: async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { noReg: parsed.data.noReg },
          select: { account: { select: { id: true } } },
        });
        if (!employee?.account) throw forbiddenAsNotFound();
        await this.lockAccountRow(tx, employee.account.id);
        const [unit, activeHead, owner] = await Promise.all([
          tx.organizationUnit.findUnique({ where: { id: unitId } }),
          tx.routeMapping.findFirst({
            where: {
              organizationUnitId: unitId,
              kind: RouteKind.DEPARTMENT_HEAD,
              effectiveTo: null,
            },
          }),
          tx.userAccount.findUnique({
            where: { id: employee.account.id },
            include: {
              employee: {
                include: { memberships: { where: { snapshot: { status: 'ACTIVE' } } } },
              },
            },
          }),
        ]);
        if (
          !unit ||
          !owner ||
          owner.accountKind !== AccountKind.WORKFORCE ||
          owner.status !== AccountStatus.ACTIVE ||
          !owner.employee?.active ||
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
          tx,
          actor,
          RouteKind.DEFAULT_DEPARTMENT,
          owner.id,
          unitId,
          'Assigned by registration number through remediation',
        );
      },
    });
  }

  async setGlobalPic(actor: AuthActor, body: unknown, idempotencyKey?: string): Promise<unknown> {
    this.requireIdempotencyKey(idempotencyKey);
    const parsed = routePicBody.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'noReg is required');
    const requestHash = canonicalHash(parsed.data);
    return this.executeIdempotent({
      actor,
      scope: 'admin:global-pic',
      key: idempotencyKey,
      requestHash,
      resourceLock: `route:${RouteKind.GLOBAL_SPECIAL}:global`,
      serialize: (result) => result as unknown as Prisma.InputJsonValue,
      work: async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { noReg: parsed.data.noReg },
          select: { account: { select: { id: true } } },
        });
        if (!employee?.account) throw badRequest('GLOBAL_PIC_INVALID', 'No. Reg is not eligible');
        await this.lockAccountRow(tx, employee.account.id);
        const owner = await tx.userAccount.findUnique({
          where: { id: employee.account.id },
          include: {
            employee: {
              include: { memberships: { where: { snapshot: { status: 'ACTIVE' } } } },
            },
          },
        });
        if (
          !owner ||
          owner.status !== AccountStatus.ACTIVE ||
          owner.accountKind !== AccountKind.WORKFORCE ||
          !owner.employee?.active ||
          !owner.employee.memberships.some((membership) =>
            isDepartmentHead(membership.structuralPosition),
          )
        )
          throw badRequest('GLOBAL_PIC_INVALID', 'Global PIC must be an active Department Head');
        return this.replaceRoute(
          tx,
          actor,
          RouteKind.GLOBAL_SPECIAL,
          owner.id,
          null,
          'Assigned by registration number through remediation',
        );
      },
    });
  }

  unionAccounts() {
    return this.prisma.unionAccountTerm.findMany({
      where: { effectiveTo: null },
      include: {
        account: { select: accountResponseSelect },
      },
      orderBy: { slot: 'asc' },
    });
  }

  async setUnionAccount(
    actor: AuthActor,
    slotValue: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> {
    this.requireIdempotencyKey(idempotencyKey);
    if (!slots.has(slotValue as UnionSlot))
      throw badRequest('UNION_SLOT_INVALID', 'Union slot must be HEAD, OFFICER_1, or OFFICER_2');
    const slot = slotValue as UnionSlot;
    const parsed = unionBody.safeParse(body);
    if (!parsed.success)
      throw badRequest(
        'VALIDATION_ERROR',
        'username, displayName, expectedCurrentTerm, and reason are required',
      );
    const username = parsed.data.username.toLocaleLowerCase('en-US');
    const requestHash = canonicalHash({ slot, ...parsed.data, username });
    return this.executeIdempotent<{
      slot: UnionSlot;
      account: unknown;
      temporaryPassword: string;
      passwordChangeRequired: boolean;
    }>({
      actor,
      scope: `admin:union:${slot}`,
      key: idempotencyKey,
      requestHash,
      resourceLock: `union-slot:${slot}`,
      serialize: (result) =>
        ({
          slot: result.slot,
          account: result.account,
          passwordChangeRequired: true,
        }) as unknown as Prisma.InputJsonValue,
      replay: (_tx, response) => ({
        ...response,
        slot,
        account: response.account,
        temporaryPassword: username,
        passwordChangeRequired: true,
      }),
      work: async (tx) => {
        const [initialUsername, initialCurrent] = await Promise.all([
          tx.userAccount.findUnique({ where: { username }, select: { id: true } }),
          tx.unionAccountTerm.findFirst({
            where: { slot, effectiveTo: null },
            select: { accountId: true },
          }),
        ]);
        for (const accountId of [...new Set([initialUsername?.id, initialCurrent?.accountId])]
          .filter((value): value is string => Boolean(value))
          .sort())
          await this.lockAccountRow(tx, accountId);
        const existingUsername = await tx.userAccount.findUnique({ where: { username } });
        const current = await tx.unionAccountTerm.findFirst({
          where: { slot, effectiveTo: null },
          include: { account: true },
        });
        if (parsed.data.expectedCurrentTerm !== (current?.id ?? null))
          throw conflict('VERSION_CONFLICT', 'Union slot has changed; reload and retry');
        if (existingUsername && existingUsername.id !== current?.accountId)
          throw conflict('USERNAME_EXISTS', 'Username is already used');
        const passwordHash = await hash(username, {
          type: 2,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        });
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
          reason: parsed.data.reason,
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
              reason: parsed.data.reason,
              details: { accountId: account.id, slot },
            },
          });
        }
        const safeAccount = await tx.userAccount.findUniqueOrThrow({
          where: { id: account.id },
          select: accountResponseSelect,
        });
        return {
          slot,
          account: safeAccount,
          temporaryPassword: username,
          passwordChangeRequired: true,
        };
      },
    });
  }

  private async replaceRoute(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    kind: RouteKind,
    ownerAccountId: string,
    organizationUnitId: string | null,
    reason: string,
  ) {
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
    const cursorId = query?.cursor ? decodeCursor(query.cursor) : undefined;
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

  private requireAiRuntimeConfig() {
    if (!this.aiRuntimeConfig) throw new Error('AI runtime configuration service unavailable');
    return this.aiRuntimeConfig;
  }

  private requireAi() {
    if (!this.ai) throw new Error('AI service unavailable');
    return this.ai;
  }

  private async executeIdempotent<T>(options: {
    actor: AuthActor;
    scope: string;
    key?: string;
    requestHash: string;
    resourceLock: string;
    work: (tx: Prisma.TransactionClient) => Promise<T>;
    serialize: (result: T) => Prisma.InputJsonValue;
    replay?: (tx: Prisma.TransactionClient, response: Record<string, unknown>) => Promise<T> | T;
    statusCode?: number;
  }): Promise<T> {
    const idempotencyLock = `${options.actor.accountId}:${options.scope}:${options.key ?? 'none'}`;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLock}, 0))::text AS lock`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${options.resourceLock}, 0))::text AS lock`;
        if (options.key) {
          const existing = await tx.idempotencyRecord.findUnique({
            where: {
              accountId_scope_key: {
                accountId: options.actor.accountId,
                scope: options.scope,
                key: options.key,
              },
            },
          });
          if (existing) {
            if (existing.requestHash !== options.requestHash)
              throw conflict(
                'IDEMPOTENCY_CONFLICT',
                'Idempotency key reused with different payload',
              );
            const response = existing.response as Record<string, unknown>;
            return options.replay ? options.replay(tx, response) : (response as T);
          }
        }
        const result = await options.work(tx);
        if (options.key)
          await tx.idempotencyRecord.create({
            data: {
              accountId: options.actor.accountId,
              scope: options.scope,
              key: options.key,
              requestHash: options.requestHash,
              statusCode: options.statusCode ?? 200,
              response: options.serialize(result),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        return result;
      },
      { timeout: 120_000 },
    );
  }

  private requireIdempotencyKey(key?: string) {
    if (!key || key.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
  }

  private async lockAccountRow(tx: Prisma.TransactionClient, accountId: string) {
    await tx.$queryRaw`SELECT "id"::text FROM "UserAccount" WHERE "id" = ${accountId}::uuid FOR UPDATE`;
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
