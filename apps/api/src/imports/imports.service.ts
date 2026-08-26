import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
import { canonicalHash, randomToken, sha256 } from '../common/crypto';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
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

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
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
    const globalRoute = configuredRoutes.find((route) => route.kind === RouteKind.GLOBAL_SPECIAL);
    const incomingGlobalOwner = globalRoute?.owner.employee
      ? incoming.get(globalRoute.owner.employee.noReg)
      : undefined;
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
      globalPicInvalid:
        !globalRoute ||
        normalize(incomingGlobalOwner?.structuralPosition ?? '').toLocaleLowerCase('en-US') !==
          'department head',
      unionGaps: (['HEAD', 'OFFICER_1', 'OFFICER_2'] as const).filter(
        (slot) => !unionTerms.some((term) => term.slot === slot),
      ),
      changes,
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
    return this.prisma.importBatch.create({
      data: {
        actorId: actor.accountId,
        checksum,
        storageKey,
        summary,
        errors: errors as Prisma.InputJsonValue,
        baseSnapshotId: activeSnapshot?.id,
        expiresAt: new Date(Date.now() + 72 * 3_600_000),
      },
    });
  }

  async list(query?: { cursor?: string; limit?: string | number; status?: string }) {
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
        await this.prisma.importBatch
          .update({ where: { id: batch.id }, data: { status: ImportStatus.EXPIRED } })
          .catch(() => undefined);
        (batch as { status: ImportStatus }).status = ImportStatus.EXPIRED;
      }
    }
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    // maintain backward compatibility: if caller expects array, they can use items; new API returns object with items+nextCursor
    // we return paginated object; existing tests that directly query prisma are unaffected
    return { items: data, nextCursor };
  }
  async detail(id: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: { issues: true },
    });
    if (!batch) throw forbiddenAsNotFound();
    if (
      batch.status === ImportStatus.PREVIEWED &&
      batch.expiresAt &&
      batch.expiresAt.getTime() < Date.now()
    ) {
      await this.prisma.importBatch
        .update({ where: { id }, data: { status: ImportStatus.EXPIRED } })
        .catch(() => undefined);
      batch.status = ImportStatus.EXPIRED;
    }
    return batch;
  }
  async changes(id: string, query?: { cursor?: string; limit?: string | number; filter?: string }) {
    const batch = await this.detail(id);
    const allChanges =
      ((batch.summary as Record<string, unknown>).changes as
        Array<Record<string, unknown>> | undefined) ?? [];
    const filter =
      query?.filter && ['CREATE', 'UPDATE', 'UNCHANGED', 'DEACTIVATE'].includes(query.filter)
        ? query.filter
        : undefined;
    const filtered = filter
      ? allChanges.filter((c) => (c as { type?: string }).type === filter)
      : allChanges;
    // stable sort by noReg then type
    const sorted = [...filtered].sort((a, b) => {
      const aNoReg = String((a as { noReg?: string }).noReg ?? '');
      const bNoReg = String((b as { noReg?: string }).noReg ?? '');
      if (aNoReg !== bNoReg) return aNoReg.localeCompare(bNoReg);
      const aType = String((a as { type?: string }).type ?? '');
      const bType = String((b as { type?: string }).type ?? '');
      return aType.localeCompare(bType);
    });
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
    let start = 0;
    if (cursorId) {
      // cursor encodes an id like `${batchId}:${index}:${noReg}` but we stored changes as array; we use simple index-based cursor via encodeCursor of synthetic id
      // For simplicity, decode cursor as synthetic id and find index
      const idx = sorted.findIndex(
        (_, index) => encodeCursor(`${id}:${String(index).padStart(6, '0')}`) === query!.cursor,
      );
      if (idx >= 0) start = idx + 1;
      else {
        // fallback: try to find by noReg encoded as cursor id directly (if cursor is a noReg)
        const noRegIdx = sorted.findIndex((c) => (c as { noReg?: string }).noReg === cursorId);
        if (noRegIdx >= 0) start = noRegIdx + 1;
      }
    }
    // simpler: if cursor is opaque id of the last item's synthetic id, find it
    if (cursorId && start === 0) {
      // try to match synthetic id
      const syntheticIdx = sorted.findIndex(
        (_, index) => `${id}:${String(index).padStart(6, '0')}` === cursorId,
      );
      if (syntheticIdx >= 0) start = syntheticIdx + 1;
    }
    const slice = sorted.slice(start, start + take + 1);
    const hasNext = slice.length > take;
    const data = hasNext ? slice.slice(0, take) : slice;
    const nextCursor =
      hasNext && data.length
        ? encodeCursor(`${id}:${String(start + data.length - 1).padStart(6, '0')}`)
        : null;
    // also compute pagination meta via take+1 pattern using synthetic ids
    // For compatibility, also support cursor as noReg: fallback above
    // Return paginated structure with items and nextCursor, plus legacy id
    return { id, items: data, nextCursor, total: sorted.length };
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
    const search = query?.search?.trim();
    const where: Prisma.OrganizationUnitWhereInput = search
      ? {
          OR: [
            { directorate: { contains: search, mode: 'insensitive' } },
            { division: { contains: search, mode: 'insensitive' } },
            { department: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
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

  async confirm(actor: AuthActor, id: string, body?: unknown, idempotencyKey?: string) {
    const parsedBody = body as Record<string, unknown> | undefined;
    const checksum = typeof parsedBody?.checksum === 'string' ? parsedBody.checksum : undefined;
    const expectedVersion =
      typeof parsedBody?.expectedVersion === 'number' ? parsedBody.expectedVersion : undefined;
    const requestHash = canonicalHash({
      id,
      checksum: checksum ?? null,
      expectedVersion: expectedVersion ?? null,
    });
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          accountId_scope_key: {
            accountId: actor.accountId,
            scope: `import:confirm:${id}`,
            key: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw conflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was reused with a different payload',
          );
        return existing.response as { id: string; status: ImportStatus };
      }
    }
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, actorId: actor.accountId },
      select: { errors: true, checksum: true, version: true, expiresAt: true, status: true },
    });
    if (!batch) throw forbiddenAsNotFound();
    if (
      batch.expiresAt &&
      batch.expiresAt.getTime() < Date.now() &&
      batch.status === ImportStatus.PREVIEWED
    ) {
      await this.prisma.importBatch
        .update({ where: { id }, data: { status: ImportStatus.EXPIRED } })
        .catch(() => undefined);
      throw conflict('IMPORT_EXPIRED', 'Import preview has expired');
    }
    if (batch.expiresAt && batch.expiresAt.getTime() < Date.now())
      throw conflict('IMPORT_EXPIRED', 'Import preview has expired');
    if (checksum !== undefined && checksum !== batch.checksum)
      throw conflict('CHECKSUM_MISMATCH', 'Checksum does not match preview');
    if (expectedVersion !== undefined && expectedVersion !== batch.version)
      throw conflict('VERSION_CONFLICT', 'Preview version has changed; reload and retry');
    if (Array.isArray(batch.errors) && batch.errors.length)
      throw conflict('IMPORT_VALIDATION_FAILED', 'Import preview contains blocking errors');
    const result = await this.prisma.importBatch.updateMany({
      where: {
        id,
        actorId: actor.accountId,
        status: ImportStatus.PREVIEWED,
        expiresAt: { gt: new Date() },
        ...(expectedVersion !== undefined ? { version: expectedVersion } : {}),
        ...(checksum !== undefined ? { checksum } : {}),
      },
      data: { status: ImportStatus.QUEUED, version: { increment: 1 } },
    });
    if (!result.count)
      throw conflict('IMPORT_NOT_CONFIRMABLE', 'Import is stale, expired, or already confirmed');
    void this.processNext();
    const response = { id, status: ImportStatus.QUEUED };
    if (idempotencyKey) {
      await this.prisma.idempotencyRecord
        .create({
          data: {
            accountId: actor.accountId,
            scope: `import:confirm:${id}`,
            key: idempotencyKey,
            requestHash,
            statusCode: 202,
            response: response as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => undefined);
    }
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
    try {
      await this.processBatch(claimed);
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id: claimed } });
      await this.prisma.importBatch.update({
        where: { id: claimed },
        data:
          retryable && batch.version < 3
            ? { status: ImportStatus.QUEUED, version: { increment: 1 }, failureCode: null }
            : { status: ImportStatus.FAILED, failureCode: this.failureCode(error) },
      });
    }
    return claimed;
  }

  private async processBatch(id: string) {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id } });
    const path = resolve(loadConfig().MEDIA_ROOT, batch.storageKey);
    const buffer = await readFile(path);
    if (sha256(buffer) !== batch.checksum) throw new Error('CHECKSUM_MISMATCH');
    const rows = await this.parse(buffer, batch.storageKey.endsWith('.csv') ? 'csv' : 'xlsx');
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
        const unitIds = new Map<string, string>();
        for (const row of rows) {
          const unit = await tx.organizationUnit.upsert({
            where: {
              directorate_division_department: {
                directorate: normalize(row.directorate),
                division: normalize(row.division),
                department: normalize(row.department),
              },
            },
            create: {
              directorate: normalize(row.directorate),
              division: normalize(row.division),
              department: normalize(row.department),
            },
            update: {},
          });
          unitIds.set(unitKey(row), unit.id);
        }
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
        for (const account of omitted) {
          const activeVoices = await tx.voice.findMany({
            where: {
              status: { not: 'CLOSED' },
              OR: [{ routeOwnerId: account.id }, { currentHandlerId: account.id }],
            },
            select: { id: true },
          });
          if (activeVoices.length)
            await tx.legacyVoiceAccess.createMany({
              data: activeVoices.map((voice) => ({
                voiceId: voice.id,
                accountId: account.id,
                reason: 'MONTHLY_SNAPSHOT_REMOVAL',
              })),
              skipDuplicates: true,
            });
          await tx.userAccount.update({
            where: { id: account.id },
            data: {
              status: activeVoices.length ? AccountStatus.LEGACY_HANDLER : AccountStatus.INACTIVE,
              deactivatedAt: new Date(),
            },
          });
          if (account.employeeId)
            await tx.employee.update({
              where: { id: account.employeeId },
              data: { active: false },
            });
          await tx.session.updateMany({
            where: { accountId: account.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        const headRows = rows.filter(
          (row) =>
            normalize(row.structuralPosition).toLocaleLowerCase('en-US') === 'department head',
        );
        const unitHeads = new Set(headRows.map(unitKey));
        const configurableRoutes = await tx.routeMapping.findMany({
          where: {
            kind: { in: [RouteKind.DEFAULT_DEPARTMENT, RouteKind.GLOBAL_SPECIAL] },
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
            (route.kind === RouteKind.GLOBAL_SPECIAL
              ? ownerMembership?.structuralPosition.trim().toLocaleLowerCase('en-US') ===
                'department head'
              : Boolean(ownerMembership && defaultUnitStillPresent));
          if (!valid) {
            await tx.routeMapping.update({
              where: { id: route.id },
              data: { effectiveTo: new Date() },
            });
            await tx.importIssue.create({
              data: {
                batchId: batch.id,
                type:
                  route.kind === RouteKind.GLOBAL_SPECIAL
                    ? ImportIssueType.INVALID_GLOBAL_PIC
                    : ImportIssueType.INVALID_DEFAULT_PIC,
                organizationUnitId: route.organizationUnitId,
                accountId: route.ownerAccountId,
                details: { routeMappingId: route.id },
              },
            });
          }
        }
        if (
          !(await tx.routeMapping.count({
            where: { kind: RouteKind.GLOBAL_SPECIAL, effectiveTo: null },
          }))
        )
          await tx.importIssue.create({
            data: {
              batchId: batch.id,
              type: ImportIssueType.INVALID_GLOBAL_PIC,
              details: { reason: 'MISSING' },
            },
          });
        await tx.routeMapping.updateMany({
          where: { kind: RouteKind.DEPARTMENT_HEAD, effectiveTo: null },
          data: { effectiveTo: new Date() },
        });
        for (const row of headRows) {
          const owner = await tx.userAccount.findUniqueOrThrow({
            where: { username: row.noReg.toLocaleLowerCase('en-US') },
          });
          await tx.routeMapping.create({
            data: {
              kind: RouteKind.DEPARTMENT_HEAD,
              organizationUnitId: unitIds.get(unitKey(row)),
              ownerAccountId: owner.id,
              createdById: batch.actorId,
              reason: `Organization import ${batch.id}`,
            },
          });
        }
        for (const row of rows.filter(
          (candidate, index, all) =>
            all.findIndex((item) => unitKey(item) === unitKey(candidate)) === index,
        )) {
          if (normalize(row.department) === '14')
            await tx.importIssue.create({
              data: {
                batchId: batch.id,
                type: ImportIssueType.DEPARTMENT_14,
                organizationUnitId: unitIds.get(unitKey(row)),
                details: { department: '14' },
              },
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
              await tx.importIssue.create({
                data: {
                  batchId: batch.id,
                  type: ImportIssueType.MISSING_DEPARTMENT_HEAD,
                  organizationUnitId,
                  details: {
                    directorate: row.directorate,
                    division: row.division,
                    department: row.department,
                  },
                },
              });
          }
        }
        const unionTerms = await tx.unionAccountTerm.findMany({
          where: { effectiveTo: null, account: { status: AccountStatus.ACTIVE } },
        });
        if (!unionTerms.some((term) => term.slot === 'HEAD'))
          await tx.importIssue.create({
            data: { batchId: batch.id, type: ImportIssueType.UNION_HEAD_MISSING, details: {} },
          });
        for (const slot of ['OFFICER_1', 'OFFICER_2'] as const)
          if (!unionTerms.some((term) => term.slot === slot))
            await tx.importIssue.create({
              data: {
                batchId: batch.id,
                type: ImportIssueType.UNION_OFFICER_MISSING,
                details: { slot },
              },
            });
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
    await unlink(path).catch(() => undefined);
  }

  async parse(buffer: Buffer, format: ImportFormat = 'xlsx'): Promise<ImportRow[]> {
    if (format === 'csv') return this.parseCsv(buffer);
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

  private failureCode(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return ['CHECKSUM_MISMATCH', 'STALE_BASE_SNAPSHOT', 'ACCOUNT_KIND_COLLISION'].includes(message)
      ? message
      : 'PROCESSING_FAILED';
  }
}
