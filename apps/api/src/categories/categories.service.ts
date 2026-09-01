import { Injectable } from '@nestjs/common';
import {
  GeneralVoiceCategoryRouteMode,
  GeneralVoiceCategoryStatus,
  ImportIssueStatus,
  ImportIssueType,
  Prisma,
} from '@prisma/client';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { canonicalHash } from '../common/crypto';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { PrismaService } from '../prisma.service';

const routeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('RELATED_REPORTER_DEPARTMENT') }).strict(),
  z.object({ mode: z.literal('FIXED_DEPARTMENT'), organizationUnitId: z.string().uuid() }).strict(),
]);
const contentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  definition: z.string().trim().min(1).max(4000),
  examples: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  route: routeSchema,
});
const createSchema = contentSchema.strict();
const updateSchema = contentSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
const statusSchema = z
  .object({
    status: z.nativeEnum(GeneralVoiceCategoryStatus),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async activeCatalog() {
    const rows = await this.prisma.generalVoiceCategory.findMany({
      where: { status: GeneralVoiceCategoryStatus.ACTIVE },
      orderBy: { key: 'asc' },
      include: { revisions: { where: { effectiveTo: null }, take: 1 } },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.revisions[0]!.name,
      definition: row.revisions[0]!.definition,
      examples: row.revisions[0]!.examples as string[],
      revisionId: row.revisions[0]!.id,
    }));
  }

  async publicCatalog() {
    return (await this.activeCatalog()).map(({ id, key, name }) => ({ id, key, name }));
  }

  async byKey(key: string, requireActive = true) {
    const row = await this.prisma.generalVoiceCategory.findUnique({
      where: { key },
      include: {
        revisions: { where: { effectiveTo: null }, take: 1 },
        routes: { where: { effectiveTo: null }, take: 1 },
      },
    });
    if (
      !row ||
      (requireActive && row.status !== GeneralVoiceCategoryStatus.ACTIVE) ||
      !row.revisions[0]
    )
      throw conflict(
        'CATEGORY_CONFIGURATION_CHANGED',
        'Kategori General Voice tidak lagi aktif; lakukan klasifikasi ulang',
      );
    return { ...row, revision: row.revisions[0], route: row.routes[0] ?? null };
  }

  async list(status?: string) {
    const parsedStatus =
      status && status !== 'ALL'
        ? GeneralVoiceCategoryStatus[status as keyof typeof GeneralVoiceCategoryStatus]
        : undefined;
    const rows = await this.prisma.generalVoiceCategory.findMany({
      where: parsedStatus ? { status: parsedStatus } : {},
      orderBy: { key: 'asc' },
      include: {
        revisions: { where: { effectiveTo: null }, take: 1 },
        routes: { where: { effectiveTo: null }, take: 1, include: { organizationUnit: true } },
      },
    });
    return Promise.all(rows.map((row) => this.adminShape(row)));
  }

  async history(id: string) {
    await this.requireCategory(id);
    return this.prisma.generalVoiceCategoryRevision.findMany({
      where: { categoryId: id },
      orderBy: { revision: 'desc' },
    });
  }

  async detail(id: string) {
    const row = await this.prisma.generalVoiceCategory.findUnique({
      where: { id },
      include: {
        revisions: { where: { effectiveTo: null }, take: 1 },
        routes: { where: { effectiveTo: null }, take: 1, include: { organizationUnit: true } },
      },
    });
    if (!row) throw forbiddenAsNotFound();
    return this.adminShape(row);
  }

  async create(actor: AuthActor, body: unknown, key?: string) {
    this.requireKey(key);
    const data = this.parse(createSchema, body);
    const requestHash = canonicalHash(data);
    const replay = await this.replay(
      actor,
      'admin:general-voice-category:create',
      key!,
      requestHash,
    );
    if (replay) return replay;
    await this.validateRoute(data.route);
    let base =
      data.name
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase() || 'CATEGORY';
    if (base.length > 70) base = base.slice(0, 70);
    let categoryKey = base;
    for (
      let i = 2;
      await this.prisma.generalVoiceCategory.findUnique({ where: { key: categoryKey } });
      i += 1
    )
      categoryKey = `${base}_${i}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const category = await tx.generalVoiceCategory.create({
        data: { key: categoryKey, createdById: actor.accountId },
      });
      await tx.generalVoiceCategoryRevision.create({
        data: {
          categoryId: category.id,
          revision: 1,
          name: data.name,
          definition: data.definition,
          examples: data.examples,
          createdById: actor.accountId,
        },
      });
      await tx.generalVoiceCategoryRoute.create({
        data: {
          categoryId: category.id,
          mode: data.route.mode,
          organizationUnitId:
            data.route.mode === 'FIXED_DEPARTMENT' ? data.route.organizationUnitId : null,
          createdById: actor.accountId,
        },
      });
      await this.audit(tx, actor, 'GENERAL_VOICE_CATEGORY_CREATED', category.id, {
        key: category.key,
        routeMode: data.route.mode,
      });
      return category;
    });
    await this.reconcile(result.id);
    const response = (await this.list()).find((item) => item.id === result.id)!;
    await this.remember(actor, 'admin:general-voice-category:create', key!, requestHash, response);
    return response;
  }

  async update(actor: AuthActor, id: string, body: unknown, key?: string) {
    this.requireKey(key);
    const data = this.parse(updateSchema, body);
    const requestHash = canonicalHash({ id, ...data });
    const scope = `admin:general-voice-category:update:${id}`;
    const replay = await this.replay(actor, scope, key!, requestHash);
    if (replay) return replay;
    await this.validateRoute(data.route);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.generalVoiceCategory.findUnique({
        where: { id },
        include: {
          revisions: { where: { effectiveTo: null }, take: 1 },
          routes: { where: { effectiveTo: null }, take: 1 },
        },
      });
      if (!current) throw forbiddenAsNotFound();
      if (current.version !== data.expectedVersion)
        throw conflict('CATEGORY_VERSION_CONFLICT', 'Konfigurasi kategori telah berubah');
      const now = new Date();
      await tx.generalVoiceCategory.update({ where: { id }, data: { version: { increment: 1 } } });
      await tx.generalVoiceCategoryRevision.updateMany({
        where: { categoryId: id, effectiveTo: null },
        data: { effectiveTo: now },
      });
      await tx.generalVoiceCategoryRevision.create({
        data: {
          categoryId: id,
          revision: (current.revisions[0]?.revision ?? 0) + 1,
          name: data.name,
          definition: data.definition,
          examples: data.examples,
          createdById: actor.accountId,
        },
      });
      await tx.generalVoiceCategoryRoute.updateMany({
        where: { categoryId: id, effectiveTo: null },
        data: { effectiveTo: now },
      });
      await tx.generalVoiceCategoryRoute.create({
        data: {
          categoryId: id,
          mode: data.route.mode,
          organizationUnitId:
            data.route.mode === 'FIXED_DEPARTMENT' ? data.route.organizationUnitId : null,
          createdById: actor.accountId,
        },
      });
      await this.audit(tx, actor, 'GENERAL_VOICE_CATEGORY_UPDATED', id, {
        revision: (current.revisions[0]?.revision ?? 0) + 1,
        routeMode: data.route.mode,
        contentHash: canonicalHash({
          name: data.name,
          definition: data.definition,
          examples: data.examples,
        }),
      });
    });
    await this.reconcile(id);
    const response = (await this.list()).find((item) => item.id === id)!;
    await this.remember(actor, scope, key!, requestHash, response);
    return response;
  }

  async setStatus(actor: AuthActor, id: string, body: unknown, key?: string) {
    this.requireKey(key);
    const data = this.parse(statusSchema, body);
    const requestHash = canonicalHash({ id, ...data });
    const scope = `admin:general-voice-category:status:${id}`;
    const replay = await this.replay(actor, scope, key!, requestHash);
    if (replay) return replay;
    if (data.status === GeneralVoiceCategoryStatus.ACTIVE) await this.validateReactivation(id);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.generalVoiceCategory.findUnique({ where: { id } });
      if (!current) throw forbiddenAsNotFound();
      if (current.version !== data.expectedVersion)
        throw conflict('CATEGORY_VERSION_CONFLICT', 'Konfigurasi kategori telah berubah');
      if (
        data.status === GeneralVoiceCategoryStatus.ARCHIVED &&
        current.status === GeneralVoiceCategoryStatus.ACTIVE &&
        (await tx.generalVoiceCategory.count({
          where: { status: GeneralVoiceCategoryStatus.ACTIVE },
        })) <= 1
      )
        throw conflict('LAST_ACTIVE_CATEGORY', 'Minimal satu kategori harus tetap aktif');
      await tx.generalVoiceCategory.update({
        where: { id },
        data: {
          status: data.status,
          archivedAt: data.status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      await this.audit(tx, actor, 'GENERAL_VOICE_CATEGORY_STATUS_CHANGED', id, {
        from: current.status,
        to: data.status,
      });
    });
    await this.reconcile(id);
    const response = (await this.list()).find((item) => item.id === id)!;
    await this.remember(actor, scope, key!, requestHash, response);
    return response;
  }

  private async adminShape(row: any) {
    const revision = row.revisions[0];
    const route = row.routes[0];
    const effectiveUnitId =
      route?.mode === GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT
        ? route.organizationUnitId
        : null;
    const ownerRoute = effectiveUnitId
      ? await this.prisma.routeMapping.findFirst({
          where: {
            organizationUnitId: effectiveUnitId,
            effectiveTo: null,
            owner: { status: 'ACTIVE' },
          },
          include: {
            owner: {
              select: { id: true, displayName: true, employee: { select: { noReg: true } } },
            },
          },
        })
      : null;
    return {
      id: row.id,
      key: row.key,
      status: row.status,
      version: row.version,
      updatedAt: row.updatedAt,
      name: revision.name,
      definition: revision.definition,
      examples: revision.examples,
      revision: revision.revision,
      route: {
        mode: route?.mode ?? null,
        organizationUnit: route?.organizationUnit ?? null,
        pic: ownerRoute
          ? {
              id: ownerRoute.owner.id,
              name: ownerRoute.owner.displayName,
              noReg: ownerRoute.owner.employee?.noReg ?? null,
            }
          : null,
        health: route?.mode === 'RELATED_REPORTER_DEPARTMENT' || ownerRoute ? 'HEALTHY' : 'GAP',
      },
    };
  }
  async reconcile(categoryId: string) {
    const category = await this.prisma.generalVoiceCategory.findUnique({
      where: { id: categoryId },
      include: { routes: { where: { effectiveTo: null }, take: 1 } },
    });
    if (!category) return;
    const route = category.routes[0];
    let issueType: ImportIssueType | null = null;
    if (
      category.status === 'ACTIVE' &&
      (!route || (route.mode === 'FIXED_DEPARTMENT' && !route.organizationUnitId))
    )
      issueType = ImportIssueType.CATEGORY_TARGET_UNAVAILABLE;
    else if (
      category.status === 'ACTIVE' &&
      route?.mode === 'FIXED_DEPARTMENT' &&
      route.organizationUnitId
    ) {
      const healthy = await this.prisma.routeMapping.count({
        where: {
          organizationUnitId: route.organizationUnitId,
          kind: { in: ['DEPARTMENT_HEAD', 'DEFAULT_DEPARTMENT'] },
          effectiveTo: null,
          owner: { status: 'ACTIVE' },
        },
      });
      if (!healthy) issueType = ImportIssueType.CATEGORY_PIC_UNAVAILABLE;
    }
    await this.prisma.importIssue.updateMany({
      where: {
        categoryId,
        status: ImportIssueStatus.OPEN,
        ...(issueType ? { type: { not: issueType } } : {}),
      },
      data: { status: ImportIssueStatus.RESOLVED, resolvedAt: new Date() },
    });
    if (
      issueType &&
      !(await this.prisma.importIssue.count({
        where: { categoryId, type: issueType, status: ImportIssueStatus.OPEN },
      }))
    ) {
      const batch = await this.prisma.importBatch.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (batch)
        await this.prisma.importIssue.create({
          data: {
            batchId: batch.id,
            categoryId,
            type: issueType,
            organizationUnitId: route?.organizationUnitId ?? null,
            details: { categoryKey: category.key },
          },
        });
    }
  }
  private requireCategory(id: string) {
    return this.prisma.generalVoiceCategory.findUnique({ where: { id } }).then((row) => {
      if (!row) throw forbiddenAsNotFound();
      return row;
    });
  }
  private async validateRoute(route: z.infer<typeof routeSchema>) {
    if (
      route.mode === 'FIXED_DEPARTMENT' &&
      !(await this.prisma.organizationUnit.findUnique({ where: { id: route.organizationUnitId } }))
    )
      throw badRequest('CATEGORY_TARGET_INVALID', 'Department tujuan tidak valid');
  }
  private async validateReactivation(id: string) {
    const category = await this.prisma.generalVoiceCategory.findUnique({
      where: { id },
      include: {
        revisions: { where: { effectiveTo: null }, take: 1 },
        routes: { where: { effectiveTo: null }, take: 1 },
      },
    });
    if (!category) throw forbiddenAsNotFound();
    const route = category.routes[0];
    if (!category.revisions[0] || !route)
      throw conflict(
        'CATEGORY_CONFIGURATION_INCOMPLETE',
        'Prompt context atau route belum lengkap',
      );
    if (route.mode === GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT) {
      if (!route.organizationUnitId)
        throw conflict('CATEGORY_TARGET_UNAVAILABLE', 'Department tujuan belum dikonfigurasi');
      const owners = await this.prisma.routeMapping.count({
        where: {
          organizationUnitId: route.organizationUnitId,
          kind: { in: ['DEPARTMENT_HEAD', 'DEFAULT_DEPARTMENT'] },
          effectiveTo: null,
          owner: { status: 'ACTIVE' },
        },
      });
      if (owners !== 1)
        throw conflict('CATEGORY_PIC_UNAVAILABLE', 'Department tujuan belum memiliki PIC aktif');
    }
  }
  private requireKey(key?: string) {
    if (!key?.trim()) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required');
  }
  private async replay(actor: AuthActor, scope: string, key: string, requestHash: string) {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { accountId_scope_key: { accountId: actor.accountId, scope, key } },
    });
    if (!record) return null;
    if (record.requestHash !== requestHash)
      throw conflict(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key telah digunakan untuk request berbeda',
      );
    return record.response as unknown as Awaited<ReturnType<CategoriesService['adminShape']>>;
  }
  private async remember(
    actor: AuthActor,
    scope: string,
    key: string,
    requestHash: string,
    response: unknown,
  ) {
    await this.prisma.idempotencyRecord.create({
      data: {
        accountId: actor.accountId,
        scope,
        key,
        requestHash,
        statusCode: 200,
        response: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  }
  private parse<T>(schema: z.ZodType<T>, body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Request validation failed');
    return parsed.data;
  }
  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    action: string,
    resourceId: string,
    summary: Prisma.InputJsonValue,
  ) {
    return tx.auditEvent.create({
      data: {
        actorId: actor.accountId,
        actorAccountKind: actor.accountKind,
        actorStructuralPosition: actor.structuralPosition,
        actorCapabilities: actor.capabilities,
        action,
        result: 'SUCCESS',
        resourceType: 'GENERAL_VOICE_CATEGORY',
        resourceId,
        summary,
        correlationId: crypto.randomUUID(),
        releaseSha: process.env.RELEASE_SHA ?? 'development',
      },
    });
  }
}
