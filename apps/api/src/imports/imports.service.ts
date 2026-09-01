import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AccountKind,
  AccountStatus,
  ImportIssueStatus,
  ImportIssueType,
  ImportStatus,
  OrganizationSnapshotStatus,
  Prisma,
  RouteKind,
} from '@prisma/client';
import { hash } from 'argon2';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { z } from 'zod';
import { canonicalHash, randomToken, sha256 } from '../common/crypto';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { CategoriesService } from '../categories/categories.service';
import type { AuthActor } from '../auth/auth.types';

export const ORGANIZATION_HEADERS = [
  'Noreg',
  'Nama',
  'Posisi (struktural)',
  'Directorat',
  'Division',
  'Department',
  'Section',
] as const;
type ImportRow = {
  noReg: string;
  name: string;
  structuralPosition: string;
  directorate: string;
  division: string;
  department: string;
  section: string;
  sourceRow: number;
};
type ImportFormat = 'xlsx' | 'csv';
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const unitKey = (row: Pick<ImportRow, 'directorate' | 'division' | 'department'>) =>
  canonicalHash([
    normalize(row.directorate).toLocaleLowerCase('en-US'),
    normalize(row.division).toLocaleLowerCase('en-US'),
    normalize(row.department).toLocaleLowerCase('en-US'),
  ]);
const confirmBody = z
  .object({
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsService.name);
  private timer?: NodeJS.Timeout;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!loadConfig().OUTBOX_ENABLED) return;
    this.timer = setInterval(() => void this.processNext(), 2_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async preview(actor: AuthActor, file?: Express.Multer.File) {
    if (!file || file.size > 10_000_000)
      throw badRequest(
        'ORGANIZATION_FILE_REQUIRED',
        'An XLSX or CSV file of at most 10 MB is required',
      );
    const format = this.fileFormat(file);
    const checksum = sha256(file.buffer);
    const rows = await this.parse(file.buffer, format);
    const [activeSnapshot, usernameCollisions, configuredRoutes, unionTerms] = await Promise.all([
      this.prisma.organizationSnapshot.findFirst({
        where: { status: OrganizationSnapshotStatus.ACTIVE },
        include: { memberships: { include: { employee: true, organizationUnit: true } } },
      }),
      this.prisma.userAccount.findMany({
        where: {
          username: { in: rows.map((row) => row.noReg.toLocaleLowerCase('en-US')) },
          accountKind: { not: AccountKind.WORKFORCE },
        },
        select: { username: true, accountKind: true },
      }),
      this.prisma.routeMapping.findMany({
        where: {
          kind: { in: [RouteKind.DEFAULT_DEPARTMENT, RouteKind.GLOBAL_SPECIAL] },
          effectiveTo: null,
        },
        include: { organizationUnit: true, owner: { include: { employee: true } } },
      }),
      this.prisma.unionAccountTerm.findMany({
        where: { effectiveTo: null, account: { status: AccountStatus.ACTIVE } },
      }),
    ]);
    const current = new Map(
      activeSnapshot?.memberships.map((membership) => [membership.employee.noReg, membership]) ??
        [],
    );
    const incoming = new Map(rows.map((row) => [row.noReg, row]));
    const changes: Array<{
      noReg: string;
      type: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'DEACTIVATE';
      positionChanged?: boolean;
      organizationChanged?: boolean;
      nameChanged?: boolean;
    }> = rows.map((row) => {
      const previous = current.get(row.noReg);
      if (!previous) return { noReg: row.noReg, type: 'CREATE' as const };
      const positionChanged =
        normalize(previous.structuralPosition) !== normalize(row.structuralPosition);
      const organizationChanged = unitKey(previous.organizationUnit) !== unitKey(row);
      const nameChanged = normalize(previous.employeeName) !== normalize(row.name);
      return {
        noReg: row.noReg,
        type:
          positionChanged || organizationChanged || nameChanged
            ? ('UPDATE' as const)
            : ('UNCHANGED' as const),
        positionChanged,
        organizationChanged,
        nameChanged,
      };
    });
    for (const noReg of current.keys())
      if (!incoming.has(noReg))
        changes.push({
          noReg,
          type: 'DEACTIVATE' as const,
          positionChanged: false,
          organizationChanged: false,
          nameChanged: false,
        });
    const units = new Map<string, { row: ImportRow; headCount: number }>();
    for (const row of rows) {
      const key = unitKey(row);
      const entry = units.get(key) ?? { row, headCount: 0 };
      if (normalize(row.structuralPosition).toLocaleLowerCase('en-US') === 'department head')
        entry.headCount += 1;
      units.set(key, entry);
    }
    const validDefaultKeys = new Set(
      configuredRoutes
        .filter(
          (route) =>
            route.kind === RouteKind.DEFAULT_DEPARTMENT &&
            route.organizationUnit &&
            route.owner.employee &&
            incoming.has(route.owner.employee.noReg),
        )
        .map((route) => unitKey(route.organizationUnit!)),
    );
    const summary = {
      rowCount: rows.length,
      unitCount: units.size,
      create: changes.filter((change) => change.type === 'CREATE').length,
      update: changes.filter((change) => change.type === 'UPDATE').length,
      deactivate: changes.filter((change) => change.type === 'DEACTIVATE').length,
      unchanged: changes.filter((change) => change.type === 'UNCHANGED').length,
      routeGaps: [...units.values()]
        .filter(
          (unit) =>
            unit.row.department !== '14' &&
            unit.headCount === 0 &&
            !validDefaultKeys.has(unitKey(unit.row)),
        )
        .map((unit) => ({
          directorate: unit.row.directorate,
          division: unit.row.division,
          department: unit.row.department,
        })),
      department14Rows: rows.filter((row) => normalize(row.department) === '14').length,
      globalPicInvalid: false,
      unionGaps: (['HEAD', 'OFFICER_1', 'OFFICER_2'] as const).filter(
        (slot) => !unionTerms.some((term) => term.slot === slot),
      ),
    };
    const storageKey = `imports/${randomToken(24)}.${format}`;
    const path = resolve(loadConfig().MEDIA_ROOT, storageKey);
    await mkdir(resolve(loadConfig().MEDIA_ROOT, 'imports'), { recursive: true, mode: 0o700 });
    await writeFile(path, file.buffer, { flag: 'wx', mode: 0o600 });
    const errors: Array<Record<string, unknown>> = [...units.values()]
      .filter((unit) => unit.headCount > 1)
      .map((unit) => ({
        code: 'DUPLICATE_DEPARTMENT_HEAD',
        directorate: unit.row.directorate,
        division: unit.row.division,
        department: unit.row.department,
        count: unit.headCount,
      }));
    errors.push(
      ...usernameCollisions.map((account) => ({
        code: 'ACCOUNT_KIND_COLLISION',
        username: account.username,
        accountKind: account.accountKind,
      })),
    );
    const orderedChanges = [...changes].sort(
      (a, b) => a.noReg.localeCompare(b.noReg) || a.type.localeCompare(b.type),
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const batch = await tx.importBatch.create({
          data: {
            actorId: actor.accountId,
            checksum,
            storageKey,
            summary,
            errors: errors as Prisma.InputJsonValue,
            baseSnapshotId: activeSnapshot?.id,
            expiresAt: new Date(Date.now() + 72 * 3_600_000),
          },
          select: {
            id: true,
            status: true,
            checksum: true,
            version: true,
            expiresAt: true,
            summary: true,
            errors: true,
            baseSnapshotId: true,
            createdAt: true,
          },
        });
        await tx.importChange.createMany({
          data: orderedChanges.map((change, sequence) => ({
            batchId: batch.id,
            sequence,
            type: change.type,
            noReg: change.noReg,
            payload: change as Prisma.InputJsonValue,
          })),
        });
        return batch;
      });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  async list(query?: { cursor?: string; limit?: string | number; status?: string }) {
    const take = Math.min(Math.max(Number(query?.limit ?? 20), 1), 100);
    const cursorId = query?.cursor ? decodeCursor(query.cursor) : undefined;
    const statusFilter =
      query?.status && Object.values(ImportStatus).includes(query.status as ImportStatus)
        ? (query.status as ImportStatus)
        : undefined;
    // handle expiry transition on read for fetched batches
    const items = await this.prisma.importBatch.findMany({
      where: statusFilter ? { status: statusFilter } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        checksum: true,
        version: true,
        expiresAt: true,
        summary: true,
        failureCode: true,
        createdAt: true,
        confirmedAt: true,
        storageKey: true,
      },
    });
    // auto-expire PREVIEWED batches past expiry on read
    for (const batch of items) {
      if (
        batch.status === ImportStatus.PREVIEWED &&
        batch.expiresAt &&
        batch.expiresAt.getTime() < Date.now()
      ) {
        if (await this.expirePreview(batch.id)) {
          (batch as { status: ImportStatus }).status = ImportStatus.EXPIRED;
        } else {
          const current = await this.prisma.importBatch.findUnique({
            where: { id: batch.id },
            select: { status: true, version: true, confirmedAt: true, failureCode: true },
          });
          if (current) Object.assign(batch, current);
        }
      }
    }
    const hasNext = items.length > take;
    const visible = hasNext ? items.slice(0, take) : items;
    const data = visible.map(({ storageKey, ...batch }) => {
      void storageKey;
      return batch;
    });
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    // maintain backward compatibility: if caller expects array, they can use items; new API returns object with items+nextCursor
    // we return paginated object; existing tests that directly query prisma are unaffected
    return { items: data, nextCursor };
  }
  async detail(id: string) {
    let batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: { issues: true },
    });
    if (!batch) throw forbiddenAsNotFound();
    if (
      batch.status === ImportStatus.PREVIEWED &&
      batch.expiresAt &&
      batch.expiresAt.getTime() < Date.now()
    ) {
      if (await this.expirePreview(id)) batch.status = ImportStatus.EXPIRED;
      else {
        batch = await this.prisma.importBatch.findUnique({
          where: { id },
          include: { issues: true },
        });
        if (!batch) throw forbiddenAsNotFound();
      }
    }
    const { storageKey, ...safeBatch } = batch;
    void storageKey;
    return safeBatch;
  }
  async changes(id: string, query?: { cursor?: string; limit?: string | number; filter?: string }) {
    await this.detail(id);
    const filter =
      query?.filter && ['CREATE', 'UPDATE', 'UNCHANGED', 'DEACTIVATE'].includes(query.filter)
        ? query.filter
        : undefined;
    const take = Math.min(Math.max(Number(query?.limit ?? 20), 1), 100);
    const cursorId = query?.cursor ? decodeCursor(query.cursor) : undefined;
    const where: Prisma.ImportChangeWhereInput = {
      batchId: id,
      ...(filter ? { type: filter } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.importChange.findMany({
        where,
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        take: take + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      }),
      this.prisma.importChange.count({ where }),
    ]);
    const hasNext = rows.length > take;
    const page = hasNext ? rows.slice(0, take) : rows;
    const items = page.map((row) => row.payload as Record<string, unknown>);
    return {
      id,
      items,
      nextCursor: hasNext && page.length ? encodeCursor(page[page.length - 1].id) : null,
      total,
    };
  }

  async getCurrentSnapshot() {
    const snapshot = await this.prisma.organizationSnapshot.findFirst({
      where: { status: OrganizationSnapshotStatus.ACTIVE },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!snapshot) return null;
    const [unitCount, memberCount] = await Promise.all([
      this.prisma.organizationUnit.count({ where: {} }),
      this.prisma.organizationMembership.count({ where: { snapshotId: snapshot.id } }),
    ]);
    const headCount = await this.prisma.organizationMembership
      .count({
        where: {
          snapshotId: snapshot.id,
          structuralPosition: { equals: 'Section Head', mode: 'insensitive' },
        },
      })
      .catch(() => 0);
    // also count Department Head members - but we count all structural positions that are Department Head
    const departmentHeadCount = await this.prisma.organizationMembership
      .count({
        where: {
          snapshotId: snapshot.id,
          structuralPosition: { equals: 'Department Head', mode: 'insensitive' },
        },
      })
      .catch(() => 0);
    return {
      id: snapshot.id,
      checksum: snapshot.checksum,
      effectiveAt: snapshot.effectiveAt,
      rowCount: snapshot.rowCount,
      status: snapshot.status,
      unitCount,
      memberCount,
      headCount: headCount + departmentHeadCount,
      sourceSnapshotId: snapshot.id,
    };
  }

  async listOrganizationUnits(query?: {
    cursor?: string;
    limit?: string | number;
    search?: string;
    division?: string;
  }) {
    const take = Math.min(Math.max(Number(query?.limit ?? 20), 1), 100);
    const cursorId = query?.cursor ? decodeCursor(query.cursor) : undefined;
    const search = query?.search?.trim();
    const where: Prisma.OrganizationUnitWhereInput = {
      ...(query?.division ? { division: query.division } : {}),
      ...(search
        ? {
            OR: [
              { directorate: { contains: search, mode: 'insensitive' } },
              { division: { contains: search, mode: 'insensitive' } },
              { department: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const units = await this.prisma.organizationUnit.findMany({
      where,
      orderBy: [{ directorate: 'asc' }, { division: 'asc' }, { department: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        _count: { select: { memberships: true } },
      },
    });
    // enrich with route health and member/head counts from active snapshot
    const activeSnapshot = await this.prisma.organizationSnapshot.findFirst({
      where: { status: OrganizationSnapshotStatus.ACTIVE },
    });
    const enriched = await Promise.all(
      units.slice(0, take).map(async (unit) => {
        const memberships = activeSnapshot
          ? await this.prisma.organizationMembership.findMany({
              where: { organizationUnitId: unit.id, snapshotId: activeSnapshot.id },
              select: { structuralPosition: true },
            })
          : [];
        const memberCount = memberships.length;
        const headCount = memberships.filter(
          (m) => m.structuralPosition.trim().toLocaleLowerCase('en-US') === 'section head',
        ).length;
        const route = await this.prisma.routeMapping.findFirst({
          where: { organizationUnitId: unit.id, effectiveTo: null },
          select: { ownerAccountId: true, kind: true },
        });
        const routeHealth = route ? 'HEALTHY' : 'GAP';
        return {
          id: unit.id,
          directorate: unit.directorate,
          division: unit.division,
          department: unit.department,
          compositeKey: `${unit.directorate} / ${unit.division} / ${unit.department}`,
          memberCount,
          headCount,
          currentRouteOwnerId: route?.ownerAccountId ?? null,
          routeHealth,
          sourceSnapshotId: activeSnapshot?.id ?? null,
          isComposite: true,
        };
      }),
    );
    const hasNext = units.length > take;
    const nextCursor =
      hasNext && enriched.length ? encodeCursor(enriched[enriched.length - 1].id) : null;
    // for units beyond take, we already sliced; return paginated
    return { items: enriched, nextCursor };
  }

  async listOrganizationDivisions(search?: string) {
    const rows = await this.prisma.organizationUnit.findMany({
      where: search?.trim() ? { division: { contains: search.trim(), mode: 'insensitive' } } : {},
      distinct: ['division'],
      select: { division: true },
      orderBy: { division: 'asc' },
      take: 200,
    });
    return rows.map((row) => row.division);
  }

  async getOrganizationUnit(id: string) {
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id },
      include: { _count: { select: { memberships: true } } },
    });
    if (!unit) throw forbiddenAsNotFound();
    const activeSnapshot = await this.prisma.organizationSnapshot.findFirst({
      where: { status: OrganizationSnapshotStatus.ACTIVE },
    });
    const memberships = activeSnapshot
      ? await this.prisma.organizationMembership.findMany({
          where: { organizationUnitId: id, snapshotId: activeSnapshot.id },
          include: { employee: { select: { noReg: true, name: true } } },
        })
      : [];
    const memberCount = memberships.length;
    const headCount = memberships.filter(
      (m) => m.structuralPosition.trim().toLocaleLowerCase('en-US') === 'section head',
    ).length;
    const route = await this.prisma.routeMapping.findFirst({
      where: { organizationUnitId: id, effectiveTo: null },
      include: { owner: { select: { id: true, displayName: true, username: true } } },
    });
    const routeHealth = route ? 'HEALTHY' : 'GAP';
    return {
      id: unit.id,
      directorate: unit.directorate,
      division: unit.division,
      department: unit.department,
      compositeKey: `${unit.directorate} / ${unit.division} / ${unit.department}`,
      memberCount,
      headCount,
      currentRouteOwner: route?.owner ?? null,
      routeHealth,
      sourceSnapshot: activeSnapshot
        ? {
            id: activeSnapshot.id,
            effectiveAt: activeSnapshot.effectiveAt,
            checksum: activeSnapshot.checksum,
          }
        : null,
      sourceSnapshotId: activeSnapshot?.id ?? null,
      members: memberships.map((m) => ({
        employeeName: m.employeeName,
        structuralPosition: m.structuralPosition,
        section: m.section,
        employee: { noReg: m.employee.noReg, name: m.employee.name },
      })),
    };
  }

  async confirm(
    actor: AuthActor,
    id: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> {
    if (!idempotencyKey || idempotencyKey.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
    const parsedBody = confirmBody.safeParse(body);
    if (!parsedBody.success)
      throw badRequest('VALIDATION_ERROR', 'checksum and expectedVersion are required');
    const { checksum, expectedVersion } = parsedBody.data;
    const requestHash = canonicalHash({
      id,
      checksum,
      expectedVersion,
    });
    if (await this.expirePreview(id, actor.accountId))
      throw conflict('IMPORT_EXPIRED', 'Import preview has expired');
    const response = await this.executeIdempotent({
      actor,
      scope: `import:confirm:${id}`,
      key: idempotencyKey,
      requestHash,
      resourceLock: `import-batch:${id}`,
      statusCode: 202,
      work: async (tx) => {
        const batch = await tx.importBatch.findFirst({
          where: { id, actorId: actor.accountId },
          select: { errors: true, checksum: true, version: true, expiresAt: true, status: true },
        });
        if (!batch) throw forbiddenAsNotFound();
        if (batch.expiresAt && batch.expiresAt.getTime() < Date.now())
          throw conflict('IMPORT_EXPIRED', 'Import preview has expired');
        if (checksum !== batch.checksum)
          throw conflict('CHECKSUM_MISMATCH', 'Checksum does not match preview');
        if (expectedVersion !== batch.version)
          throw conflict('VERSION_CONFLICT', 'Preview version has changed; reload and retry');
        if (Array.isArray(batch.errors) && batch.errors.length)
          throw conflict('IMPORT_VALIDATION_FAILED', 'Import preview contains blocking errors');
        const updated = await tx.importBatch.updateMany({
          where: {
            id,
            actorId: actor.accountId,
            status: ImportStatus.PREVIEWED,
            expiresAt: { gt: new Date() },
            version: expectedVersion,
            checksum,
          },
          data: { status: ImportStatus.QUEUED, version: { increment: 1 } },
        });
        if (!updated.count)
          throw conflict(
            'IMPORT_NOT_CONFIRMABLE',
            'Import is stale, expired, or already confirmed',
          );
        return { id, status: ImportStatus.QUEUED };
      },
    });
    void this.processNext();
    return response;
  }

  async processNext() {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "ImportBatch" WHERE status = 'QUEUED'::"ImportStatus" ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      await tx.importBatch.update({
        where: { id: rows[0].id },
        data: { status: ImportStatus.PROCESSING },
      });
      return rows[0].id;
    });
    if (!claimed) return null;
    const startedAt = Date.now();
    try {
      await this.processBatch(claimed);
      const completed = await this.prisma.importBatch.findUniqueOrThrow({
        where: { id: claimed },
        select: { storageKey: true, status: true },
      });
      if (completed.status === ImportStatus.CONFIRMED)
        await this.deleteRawImport(completed.storageKey);
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      const failureCode = this.failureCode(error);
      const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id: claimed } });
      const updated = await this.prisma.importBatch.update({
        where: { id: claimed },
        data:
          retryable && batch.version < 3
            ? { status: ImportStatus.QUEUED, version: { increment: 1 }, failureCode: null }
            : { status: ImportStatus.FAILED, failureCode },
      });
      this.logger.error(
        JSON.stringify({
          event: 'organization_import_processing_failed',
          batchId: claimed,
          failureCode,
          prismaCode:
            error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
          elapsedMs: Date.now() - startedAt,
          outcome: updated.status === ImportStatus.QUEUED ? 'RETRY_QUEUED' : 'FAILED',
        }),
      );
      if (updated.status === ImportStatus.FAILED) await this.deleteRawImport(batch.storageKey);
    }
    return claimed;
  }

  private async processBatch(id: string) {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id } });
    const path = resolve(loadConfig().MEDIA_ROOT, batch.storageKey);
    const buffer = await readFile(path);
    if (sha256(buffer) !== batch.checksum) throw new Error('CHECKSUM_MISMATCH');
    const rows = await this.parse(buffer, batch.storageKey.endsWith('.csv') ? 'csv' : 'xlsx');
    const uniqueUnitRows = new Map<string, ImportRow>();
    for (const row of rows) uniqueUnitRows.set(unitKey(row), row);
    const [currentAccounts, currentEmployees] = await Promise.all([
      this.prisma.userAccount.findMany({
        select: {
          id: true,
          username: true,
          accountKind: true,
          employeeId: true,
          passwordHash: true,
        },
      }),
      this.prisma.employee.findMany({ select: { id: true, noReg: true } }),
    ]);
    const currentByUsername = new Map(
      currentAccounts.map((account) => [account.username, account]),
    );
    const employeeIds = new Map(currentEmployees.map((employee) => [employee.noReg, employee.id]));
    for (const row of rows) {
      const account = currentByUsername.get(row.noReg.toLocaleLowerCase('en-US'));
      if (account && account.accountKind !== AccountKind.WORKFORCE)
        throw new Error('ACCOUNT_KIND_COLLISION');
      if (!employeeIds.has(row.noReg)) employeeIds.set(row.noReg, randomUUID());
    }
    const accountIds = new Map(currentAccounts.map((account) => [account.username, account.id]));
    for (const row of rows) {
      const username = row.noReg.toLocaleLowerCase('en-US');
      if (!accountIds.has(username)) accountIds.set(username, randomUUID());
    }
    const currentNames = new Set(currentAccounts.map((account) => account.username));
    const passwordHashes = new Map<string, string>();
    const createNames = rows
      .map((row) => row.noReg.toLocaleLowerCase('en-US'))
      .filter((name) => !currentNames.has(name));
    for (let offset = 0; offset < createNames.length; offset += 4) {
      await Promise.all(
        createNames
          .slice(offset, offset + 4)
          .map(async (name) =>
            passwordHashes.set(
              name,
              await hash(name, { type: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
            ),
          ),
      );
    }
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('care:organization-import'))`;
        const active = await tx.organizationSnapshot.findFirst({
          where: { status: OrganizationSnapshotStatus.ACTIVE },
        });
        if ((active?.id ?? null) !== (batch.baseSnapshotId ?? null))
          throw new Error('STALE_BASE_SNAPSHOT');
        if (active)
          await tx.organizationSnapshot.update({
            where: { id: active.id },
            data: { status: OrganizationSnapshotStatus.SUPERSEDED, supersededAt: new Date() },
          });
        await tx.importIssue.updateMany({
          where: { status: ImportIssueStatus.OPEN },
          data: { status: ImportIssueStatus.SUPERSEDED, resolvedAt: new Date() },
        });
        const snapshot = await tx.organizationSnapshot.create({
          data: {
            status: OrganizationSnapshotStatus.ACTIVE,
            checksum: batch.checksum,
            rowCount: rows.length,
          },
        });
        const incoming = new Set<string>();
        const uniqueUnits = [...uniqueUnitRows.values()].map((row) => ({
          directorate: normalize(row.directorate),
          division: normalize(row.division),
          department: normalize(row.department),
        }));
        await tx.organizationUnit.createMany({ data: uniqueUnits, skipDuplicates: true });
        const persistedUnits = await tx.organizationUnit.findMany({
          where: {
            OR: uniqueUnits.map((unit) => ({
              directorate: unit.directorate,
              division: unit.division,
              department: unit.department,
            })),
          },
        });
        const unitIds = new Map(persistedUnits.map((unit) => [unitKey(unit), unit.id]));
        if (unitIds.size !== uniqueUnits.length)
          throw new Error('ORGANIZATION_UNIT_RESOLUTION_FAILED');
        for (let offset = 0; offset < rows.length; offset += 500) {
          const chunk = rows.slice(offset, offset + 500);
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "Employee" ("id", "noReg", "name", "active", "createdAt", "updatedAt") VALUES ${Prisma.join(
              chunk.map(
                (row) =>
                  Prisma.sql`(${employeeIds.get(row.noReg)}::uuid, ${row.noReg}, ${row.name}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              ),
            )} ON CONFLICT ("noReg") DO UPDATE SET "name" = EXCLUDED."name", "active" = true, "updatedAt" = CURRENT_TIMESTAMP`,
          );
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "UserAccount" ("id", "employeeId", "username", "displayName", "passwordHash", "accountKind", "status", "passwordChangeRequired", "createdAt", "updatedAt") VALUES ${Prisma.join(
              chunk.map((row) => {
                const username = row.noReg.toLocaleLowerCase('en-US');
                const existing = currentByUsername.get(username);
                return Prisma.sql`(${accountIds.get(username)}::uuid, ${employeeIds.get(row.noReg)}::uuid, ${username}, ${row.name}, ${existing?.passwordHash ?? passwordHashes.get(username)!}, 'WORKFORCE'::"AccountKind", 'ACTIVE'::"AccountStatus", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
              }),
            )} ON CONFLICT ("username") DO UPDATE SET "employeeId" = EXCLUDED."employeeId", "displayName" = EXCLUDED."displayName", "status" = 'ACTIVE'::"AccountStatus", "deactivatedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP`,
          );
          await tx.organizationMembership.createMany({
            data: chunk.map((row) => ({
              id: randomUUID(),
              snapshotId: snapshot.id,
              employeeId: employeeIds.get(row.noReg)!,
              organizationUnitId: unitIds.get(unitKey(row))!,
              employeeName: row.name,
              structuralPosition: row.structuralPosition,
              section: row.section,
              sourceRow: row.sourceRow,
            })),
          });
          for (const row of chunk) incoming.add(row.noReg.toLocaleLowerCase('en-US'));
        }
        const omitted = await tx.userAccount.findMany({
          where: { accountKind: AccountKind.WORKFORCE, username: { notIn: [...incoming] } },
          select: { id: true, employeeId: true },
        });
        if (omitted.length)
          await tx.$queryRaw(
            Prisma.sql`SELECT "id"::text FROM "UserAccount" WHERE "id"::text IN (${Prisma.join(
              omitted.map((account) => account.id),
            )}) ORDER BY "id" FOR UPDATE`,
          );
        if (omitted.length) {
          const omittedIds = omitted.map((account) => account.id);
          const omittedIdSet = new Set(omittedIds);
          const activeVoices = await tx.voice.findMany({
            where: {
              status: { not: 'CLOSED' },
              OR: [{ routeOwnerId: { in: omittedIds } }, { currentHandlerId: { in: omittedIds } }],
            },
            select: { id: true, routeOwnerId: true, currentHandlerId: true },
          });
          const legacyPairs = new Map<
            string,
            { voiceId: string; accountId: string; reason: string }
          >();
          const legacyHandlerIds = new Set<string>();
          for (const voice of activeVoices) {
            for (const accountId of [voice.routeOwnerId, voice.currentHandlerId]) {
              if (!accountId || !omittedIdSet.has(accountId)) continue;
              legacyHandlerIds.add(accountId);
              legacyPairs.set(`${voice.id}:${accountId}`, {
                voiceId: voice.id,
                accountId,
                reason: 'MONTHLY_SNAPSHOT_REMOVAL',
              });
            }
          }
          if (legacyPairs.size)
            await tx.legacyVoiceAccess.createMany({
              data: [...legacyPairs.values()],
              skipDuplicates: true,
            });
          const deactivatedAt = new Date();
          const legacyIds = [...legacyHandlerIds];
          const inactiveIds = omittedIds.filter((id) => !legacyHandlerIds.has(id));
          if (legacyIds.length)
            await tx.userAccount.updateMany({
              where: { id: { in: legacyIds } },
              data: { status: AccountStatus.LEGACY_HANDLER, deactivatedAt },
            });
          if (inactiveIds.length)
            await tx.userAccount.updateMany({
              where: { id: { in: inactiveIds } },
              data: { status: AccountStatus.INACTIVE, deactivatedAt },
            });
          const employeeIdsToDeactivate = omitted
            .map((account) => account.employeeId)
            .filter((id): id is string => Boolean(id));
          if (employeeIdsToDeactivate.length)
            await tx.employee.updateMany({
              where: { id: { in: employeeIdsToDeactivate } },
              data: { active: false },
            });
          await tx.session.updateMany({
            where: { accountId: { in: omittedIds }, revokedAt: null },
            data: { revokedAt: deactivatedAt },
          });
        }
        const headRows = rows.filter(
          (row) =>
            normalize(row.structuralPosition).toLocaleLowerCase('en-US') === 'department head',
        );
        const unitHeads = new Set(headRows.map(unitKey));
        const configurableRoutes = await tx.routeMapping.findMany({
          where: {
            kind: RouteKind.DEFAULT_DEPARTMENT,
            effectiveTo: null,
          },
          include: { owner: true, organizationUnit: true },
        });
        for (const route of configurableRoutes) {
          const ownerMembership = route.owner.employeeId
            ? await tx.organizationMembership.findFirst({
                where: { snapshotId: snapshot.id, employeeId: route.owner.employeeId },
              })
            : null;
          const defaultUnitStillPresent =
            route.organizationUnit &&
            [...unitIds.values()].includes(route.organizationUnit.id) &&
            !unitHeads.has(unitKey(route.organizationUnit));
          const valid =
            route.owner.status === AccountStatus.ACTIVE &&
            Boolean(ownerMembership && defaultUnitStillPresent);
          if (!valid) {
            await tx.routeMapping.update({
              where: { id: route.id },
              data: { effectiveTo: new Date() },
            });
            await tx.importIssue.create({
              data: {
                batchId: batch.id,
                type: ImportIssueType.INVALID_DEFAULT_PIC,
                organizationUnitId: route.organizationUnitId,
                accountId: route.ownerAccountId,
                details: { routeMappingId: route.id },
              },
            });
          }
        }
        await tx.routeMapping.updateMany({
          where: { kind: RouteKind.DEPARTMENT_HEAD, effectiveTo: null },
          data: { effectiveTo: new Date() },
        });
        if (headRows.length)
          await tx.routeMapping.createMany({
            data: headRows.map((row) => ({
              kind: RouteKind.DEPARTMENT_HEAD,
              organizationUnitId: unitIds.get(unitKey(row))!,
              ownerAccountId: accountIds.get(row.noReg.toLocaleLowerCase('en-US'))!,
              createdById: batch.actorId,
              reason: `Organization import ${batch.id}`,
            })),
          });
        const fixedCategoryTargets = [
          { keys: ['SAFETY', 'ENVIRONMENT', 'FACILITY'], department: 'Plant GA & SHE Dept' },
          { keys: ['FACILITY_REPAIR'], department: 'Smart Plant Facility Mfg Dept' },
        ];
        for (const target of fixedCategoryTargets) {
          const unit = await tx.organizationUnit.findUnique({
            where: {
              directorate_division_department: {
                directorate: 'Manufacturing & PE Dir',
                division: 'Plant Administration Div',
                department: target.department,
              },
            },
          });
          if (unit)
            await tx.generalVoiceCategoryRoute.updateMany({
              where: {
                effectiveTo: null,
                organizationUnitId: null,
                category: { key: { in: target.keys } },
              },
              data: { organizationUnitId: unit.id },
            });
        }
        const derivedIssues: Prisma.ImportIssueCreateManyInput[] = [];
        for (const row of uniqueUnitRows.values()) {
          if (normalize(row.department) === '14')
            derivedIssues.push({
              batchId: batch.id,
              type: ImportIssueType.DEPARTMENT_14,
              organizationUnitId: unitIds.get(unitKey(row)),
              details: { department: '14' },
            });
          else if (!unitHeads.has(unitKey(row))) {
            const organizationUnitId = unitIds.get(unitKey(row));
            const hasDefault = await tx.routeMapping.count({
              where: {
                kind: RouteKind.DEFAULT_DEPARTMENT,
                organizationUnitId,
                effectiveTo: null,
              },
            });
            if (!hasDefault)
              derivedIssues.push({
                batchId: batch.id,
                type: ImportIssueType.MISSING_DEPARTMENT_HEAD,
                organizationUnitId,
                details: {
                  directorate: row.directorate,
                  division: row.division,
                  department: row.department,
                },
              });
          }
        }
        const unionTerms = await tx.unionAccountTerm.findMany({
          where: { effectiveTo: null, account: { status: AccountStatus.ACTIVE } },
        });
        if (!unionTerms.some((term) => term.slot === 'HEAD'))
          derivedIssues.push({
            batchId: batch.id,
            type: ImportIssueType.UNION_HEAD_MISSING,
            details: {},
          });
        for (const slot of ['OFFICER_1', 'OFFICER_2'] as const)
          if (!unionTerms.some((term) => term.slot === slot))
            derivedIssues.push({
              batchId: batch.id,
              type: ImportIssueType.UNION_OFFICER_MISSING,
              details: { slot },
            });
        if (derivedIssues.length) await tx.importIssue.createMany({ data: derivedIssues });
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: ImportStatus.CONFIRMED,
            snapshotId: snapshot.id,
            confirmedAt: new Date(),
            version: { increment: 1 },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 },
    );
    const categoryIds = await this.prisma.generalVoiceCategory.findMany({ select: { id: true } });
    const categoryService = new CategoriesService(this.prisma);
    for (const category of categoryIds) await categoryService.reconcile(category.id);
    await unlink(path).catch(() => undefined);
  }

  async parse(buffer: Buffer, format: ImportFormat = 'xlsx'): Promise<ImportRow[]> {
    if (format === 'csv') return this.parseCsv(buffer);
    this.assertSafeXlsxArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw badRequest('XLSX_INVALID', 'XLSX file is malformed or unsupported');
    }
    const sheet = workbook.getWorksheet('MFG + QD');
    if (!sheet) throw badRequest('XLSX_SHEET_INVALID', 'Sheet MFG + QD is required');
    const headers = ORGANIZATION_HEADERS.map(
      (_, index) => sheet.getRow(1).getCell(index + 1).value,
    );
    if (
      !headers.every((value, index) => value === ORGANIZATION_HEADERS[index]) ||
      sheet.getRow(1).cellCount > ORGANIZATION_HEADERS.length
    )
      throw badRequest(
        'XLSX_HEADERS_INVALID',
        'The seven workbook headers and their order must match exactly',
      );
    if (sheet.actualRowCount - 1 > 10_000)
      throw badRequest('XLSX_ROW_LIMIT', 'Workbook exceeds 10,000 data rows');
    const values: string[][] = [];
    for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
      const cells = ORGANIZATION_HEADERS.map(
        (_, index) => sheet.getRow(rowNumber).getCell(index + 1).value,
      );
      if (cells.every((value) => value === null || value === '')) continue;
      if (!cells.every((value) => value === null || value === '' || typeof value === 'string'))
        throw badRequest(
          'XLSX_CELL_TYPE_INVALID',
          `Row ${rowNumber} must contain only plain string or blank cells`,
        );
      values.push(cells.map((value) => (typeof value === 'string' ? value : '')));
    }
    return this.buildRows(values, 'XLSX');
  }

  private parseCsv(buffer: Buffer): ImportRow[] {
    let records: string[][];
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      records = parseCsv(content, {
        bom: true,
        encoding: 'utf8',
        skip_empty_lines: true,
        relax_column_count: false,
        max_record_size: 100_000,
      }) as string[][];
    } catch {
      throw badRequest('CSV_INVALID', 'CSV must be valid UTF-8 with exactly seven columns');
    }
    const headers = records.shift() ?? [];
    if (
      headers.length !== ORGANIZATION_HEADERS.length ||
      !headers.every((value, index) => value === ORGANIZATION_HEADERS[index])
    )
      throw badRequest(
        'CSV_HEADERS_INVALID',
        'The seven CSV headers and their order must match exactly',
      );
    return this.buildRows(records, 'CSV');
  }

  private buildRows(values: string[][], source: 'XLSX' | 'CSV'): ImportRow[] {
    if (values.length > 10_000)
      throw badRequest(`${source}_ROW_LIMIT`, 'Organization file exceeds 10,000 data rows');
    const rows: ImportRow[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < values.length; index += 1) {
      const rowNumber = index + 2;
      const cells = values[index]!;
      if (cells.length !== ORGANIZATION_HEADERS.length)
        throw badRequest(
          `${source}_COLUMN_COUNT_INVALID`,
          `Row ${rowNumber} must have seven columns`,
        );
      if (cells.every((value) => value === '')) continue;
      const [noReg, name, structuralPosition, directorate, division, rawDepartment, section] =
        cells.map(normalize);
      const department = rawDepartment || '14';
      if (!noReg || !name || !structuralPosition || !directorate)
        throw badRequest(`${source}_REQUIRED_VALUE`, `Row ${rowNumber} is incomplete`);
      const key = noReg.toLocaleLowerCase('en-US');
      if (seen.has(key))
        throw badRequest(`${source}_DUPLICATE_NOREG`, `Duplicate Noreg at row ${rowNumber}`);
      seen.add(key);
      rows.push({
        noReg,
        name,
        structuralPosition,
        directorate,
        division,
        department,
        section,
        sourceRow: rowNumber,
      });
    }
    if (!rows.length)
      throw badRequest(`${source}_EMPTY`, 'Organization file must contain at least one data row');
    return rows;
  }

  private fileFormat(file: Express.Multer.File): ImportFormat {
    const name = (file.originalname ?? '').toLocaleLowerCase('en-US');
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.xlsx')) return 'xlsx';
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv') return 'csv';
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      (file.buffer[0] === 0x50 && file.buffer[1] === 0x4b)
    )
      return 'xlsx';
    throw badRequest('ORGANIZATION_FILE_TYPE_INVALID', 'Only .xlsx and .csv files are accepted');
  }

  private assertSafeXlsxArchive(buffer: Buffer) {
    if (buffer.length < 22) throw badRequest('XLSX_INVALID', 'XLSX ZIP directory is missing');
    const maxEntries = 100;
    const maxInflatedBytes = 50_000_000;
    const maxEntryBytes = 20_000_000;
    const eocdSignature = 0x06054b50;
    const centralSignature = 0x02014b50;
    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocd = -1;
    for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
      if (buffer.readUInt32LE(offset) === eocdSignature) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) throw badRequest('XLSX_INVALID', 'XLSX ZIP directory is missing');
    const entries = buffer.readUInt16LE(eocd + 10);
    const centralSize = buffer.readUInt32LE(eocd + 12);
    const centralOffset = buffer.readUInt32LE(eocd + 16);
    if (
      entries < 1 ||
      entries > maxEntries ||
      centralOffset + centralSize > buffer.length ||
      centralOffset >= eocd
    )
      throw badRequest('XLSX_ARCHIVE_LIMIT', 'XLSX archive exceeds safe structural limits');
    let offset = centralOffset;
    let inflated = 0;
    for (let index = 0; index < entries; index += 1) {
      if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralSignature)
        throw badRequest('XLSX_INVALID', 'XLSX ZIP directory is malformed');
      const flags = buffer.readUInt16LE(offset + 8);
      const method = buffer.readUInt16LE(offset + 10);
      const compressedBytes = buffer.readUInt32LE(offset + 20);
      const entryBytes = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localOffset = buffer.readUInt32LE(offset + 42);
      if ((flags & 0x1) !== 0 || (method !== 0 && method !== 8))
        throw badRequest('XLSX_INVALID', 'Encrypted or unsupported XLSX entries are not accepted');
      if (entryBytes > maxEntryBytes)
        throw badRequest('XLSX_ARCHIVE_LIMIT', 'XLSX entry exceeds the safe expansion limit');
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50)
        throw badRequest('XLSX_INVALID', 'XLSX local ZIP entry is malformed');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedBytes;
      if (dataEnd > buffer.length)
        throw badRequest('XLSX_INVALID', 'XLSX ZIP entry exceeds the archive boundary');
      let actualBytes: number;
      try {
        actualBytes =
          method === 0
            ? compressedBytes
            : inflateRawSync(buffer.subarray(dataStart, dataEnd), {
                maxOutputLength: Math.min(maxEntryBytes, maxInflatedBytes - inflated) + 1,
              }).length;
      } catch {
        throw badRequest('XLSX_ARCHIVE_LIMIT', 'XLSX entry exceeds the safe expansion limit');
      }
      if (actualBytes !== entryBytes || actualBytes > maxEntryBytes)
        throw badRequest('XLSX_INVALID', 'XLSX ZIP entry size is inconsistent');
      inflated += actualBytes;
      if (inflated > maxInflatedBytes)
        throw badRequest('XLSX_ARCHIVE_LIMIT', 'XLSX archive exceeds the safe expansion limit');
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset > centralOffset + centralSize)
      throw badRequest('XLSX_INVALID', 'XLSX ZIP directory is malformed');
  }

  private async deleteRawImport(storageKey: string) {
    const importsRoot = resolve(loadConfig().MEDIA_ROOT, 'imports');
    const path = resolve(loadConfig().MEDIA_ROOT, storageKey);
    if (!path.startsWith(`${importsRoot}/`)) return;
    await unlink(path).catch(() => undefined);
  }

  private async expirePreview(id: string, actorId?: string) {
    const storageKey = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`import-batch:${id}`}, 0))::text AS lock`;
      const batch = await tx.importBatch.findFirst({
        where: { id, ...(actorId ? { actorId } : {}) },
        select: { status: true, expiresAt: true, storageKey: true },
      });
      if (
        !batch ||
        batch.status !== ImportStatus.PREVIEWED ||
        batch.expiresAt.getTime() >= Date.now()
      )
        return null;
      const expired = await tx.importBatch.updateMany({
        where: {
          id,
          ...(actorId ? { actorId } : {}),
          status: ImportStatus.PREVIEWED,
          expiresAt: { lt: new Date() },
        },
        data: { status: ImportStatus.EXPIRED },
      });
      return expired.count ? batch.storageKey : null;
    });
    if (!storageKey) return false;
    await this.deleteRawImport(storageKey);
    return true;
  }

  private async executeIdempotent<T extends Record<string, unknown>>(options: {
    actor: AuthActor;
    scope: string;
    key?: string;
    requestHash: string;
    resourceLock: string;
    statusCode: number;
    work: (tx: Prisma.TransactionClient) => Promise<T>;
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
                'Idempotency key was reused with a different payload',
              );
            return existing.response as T;
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
              statusCode: options.statusCode,
              response: result as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        return result;
      },
      { timeout: 120_000 },
    );
  }

  private failureCode(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
      return 'PROCESSING_TIMEOUT';
    const message = error instanceof Error ? error.message : '';
    return [
      'CHECKSUM_MISMATCH',
      'STALE_BASE_SNAPSHOT',
      'ACCOUNT_KIND_COLLISION',
      'ORGANIZATION_UNIT_RESOLUTION_FAILED',
    ].includes(message)
      ? message
      : 'PROCESSING_FAILED';
  }
}
