import { Inject, Injectable } from '@nestjs/common';
import { Area, ImportStatus, ImportType, Prisma, Role, VoiceStatus } from '@prisma/client';
import { hash } from 'argon2';
import { parse as parseCsv } from 'csv-parse/sync';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { sha256 } from '../common/crypto';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from '../auth/auth.types';

type RowError = { row: number; field: string; code: string; message: string };
type Preview = {
  rows: Record<string, string>[];
  errors: RowError[];
  create: number;
  update: number;
  unchanged: number;
};
const employeeHeaders = ['no_reg', 'name', 'division', 'department'];
const managerHeaders = [
  'name',
  'no_reg',
  'division',
  'department',
  'area',
  'is_safety',
  'is_facility',
];
const unionSchema = z
  .object({
    username: z.string().trim().min(1).max(64),
    display_name: z.string().trim().min(1).max(200),
  })
  .strict();

@Injectable()
export class ImportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async preview(actor: AuthActor, typeValue: string, file: Express.Multer.File) {
    const type = ImportType[typeValue.toUpperCase() as keyof typeof ImportType];
    if (!type) throw badRequest('IMPORT_TYPE_INVALID', 'Unsupported import type');
    if (!file?.buffer?.length || file.size > 5_000_000)
      throw badRequest('IMPORT_FILE_INVALID', 'Import file is empty or too large');
    const checksum = sha256(file.buffer);
    const preview = await this.inspect(type, file.buffer);
    const root = resolve(loadConfig().MEDIA_ROOT, 'imports');
    await mkdir(root, { recursive: true, mode: 0o700 });
    const batch = await this.prisma.importBatch.create({
      data: {
        type,
        checksum,
        storageKey: 'pending',
        summary: {
          create: preview.create,
          update: preview.update,
          unchanged: preview.unchanged,
          rows: preview.rows.length,
          errorCount: preview.errors.length,
        },
        errors: preview.errors,
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
        actorId: actor.accountId,
      },
    });
    const storageKey = `${batch.id}.upload`;
    const path = this.safePath(root, storageKey);
    await writeFile(path, file.buffer, { mode: 0o600, flag: 'wx' });
    await this.prisma.importBatch.update({ where: { id: batch.id }, data: { storageKey } });
    return {
      id: batch.id,
      type,
      version: batch.version,
      summary: { ...(batch.summary as object) },
      errors: preview.errors,
      confirmable: preview.errors.length === 0,
      expiresAt: batch.expiresAt,
    };
  }
  async detail(actor: AuthActor, id: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!batch || batch.actorId !== actor.accountId) throw forbiddenAsNotFound();
    return {
      id: batch.id,
      type: batch.type,
      status: batch.status,
      version: batch.version,
      summary: batch.summary,
      errors: batch.errors,
      expiresAt: batch.expiresAt,
      confirmedAt: batch.confirmedAt,
    };
  }
  async confirm(actor: AuthActor, id: string, expectedVersion: number) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!batch || batch.actorId !== actor.accountId) throw forbiddenAsNotFound();
    if (batch.status !== ImportStatus.PREVIEWED || batch.expiresAt <= new Date())
      throw conflict('IMPORT_NOT_CONFIRMABLE', 'Import preview is expired or already finalized');
    if (batch.version !== expectedVersion)
      throw conflict('VERSION_CONFLICT', 'Import preview version is stale', {
        currentVersion: batch.version,
      });
    const root = resolve(loadConfig().MEDIA_ROOT, 'imports');
    const path = this.safePath(root, batch.storageKey);
    const buffer = await readFile(path);
    if (sha256(buffer) !== batch.checksum)
      throw conflict('IMPORT_CHECKSUM_MISMATCH', 'Import file no longer matches preview');
    const preview = await this.inspect(batch.type, buffer);
    if (preview.errors.length)
      throw badRequest(
        'IMPORT_VALIDATION_FAILED',
        'Import no longer passes validation',
        preview.errors.map((e) => ({
          field: `rows.${e.row}.${e.field}`,
          code: e.code,
          message: e.message,
        })),
      );
    await this.prisma.$transaction(
      async (tx) => {
        if (batch.type === ImportType.EMPLOYEE) await this.applyEmployees(tx, preview.rows);
        if (batch.type === ImportType.MANAGER) await this.applyManagers(tx, preview.rows);
        if (batch.type === ImportType.UNION) await this.applyUnion(tx, preview.rows[0]!);
        await tx.importBatch.update({
          where: { id, version: expectedVersion },
          data: {
            status: ImportStatus.CONFIRMED,
            confirmedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.accountId,
            actorRole: actor.role,
            action: 'IMPORT_CONFIRMED',
            result: 'SUCCESS',
            resourceType: 'ImportBatch',
            resourceId: id,
            summary: batch.summary as Prisma.InputJsonValue,
            correlationId: 'import-confirm',
            releaseSha: process.env.RELEASE_SHA ?? 'development',
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await unlink(path).catch(() => undefined);
    return { success: true };
  }
  private async inspect(type: ImportType, buffer: Buffer): Promise<Preview> {
    if (type === ImportType.UNION) {
      let value: unknown;
      try {
        value = JSON.parse(buffer.toString('utf8'));
      } catch {
        return {
          rows: [],
          errors: [{ row: 1, field: '$', code: 'INVALID_JSON', message: 'Malformed JSON' }],
          create: 0,
          update: 0,
          unchanged: 0,
        };
      }
      const parsed = unionSchema.safeParse(value);
      if (!parsed.success)
        return {
          rows: [],
          errors: parsed.error.issues.map((i) => ({
            row: 1,
            field: i.path.join('.'),
            code: i.code,
            message: i.message,
          })),
          create: 0,
          update: 0,
          unchanged: 0,
        };
      const existing = await this.prisma.userAccount.findFirst({
        where: { role: Role.UNION, active: true },
      });
      return {
        rows: [{ username: parsed.data.username, display_name: parsed.data.display_name }],
        errors: [],
        create: existing ? 0 : 1,
        update: existing ? 1 : 0,
        unchanged: 0,
      };
    }
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(buffer, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
      });
    } catch {
      return {
        rows: [],
        errors: [{ row: 1, field: '$', code: 'INVALID_CSV', message: 'Malformed CSV' }],
        create: 0,
        update: 0,
        unchanged: 0,
      };
    }
    const expected = type === ImportType.EMPLOYEE ? employeeHeaders : managerHeaders;
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const errors: RowError[] = [];
    if (headers.length !== expected.length || expected.some((h) => !headers.includes(h)))
      errors.push({
        row: 1,
        field: 'header',
        code: 'INVALID_HEADERS',
        message: `Required headers: ${expected.join(',')}`,
      });
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const n = index + 2;
      for (const h of expected)
        if (!row[h])
          errors.push({ row: n, field: h, code: 'REQUIRED', message: 'Value is required' });
      if (row.no_reg && (row.no_reg.length > 64 || seen.has(row.no_reg)))
        errors.push({
          row: n,
          field: 'no_reg',
          code: seen.has(row.no_reg) ? 'DUPLICATE' : 'TOO_LONG',
          message: 'no_reg must be unique and at most 64 characters',
        });
      seen.add(row.no_reg);
    });
    if (type === ImportType.MANAGER) await this.validateManagers(rows, errors);
    const existing = await this.prisma.employee.count({
      where: { noReg: { in: rows.map((r) => r.no_reg) } },
    });
    return { rows, errors, create: rows.length - existing, update: existing, unchanged: 0 };
  }
  private async validateManagers(rows: Record<string, string>[], errors: RowError[]) {
    const employees = await this.prisma.employee.findMany({
      where: { noReg: { in: rows.map((r) => r.no_reg) }, active: true },
      include: { account: true },
    });
    const byNo = new Map(employees.map((e) => [e.noReg, e]));
    rows.forEach((row, index) => {
      const n = index + 2;
      const employee = byNo.get(row.no_reg);
      if (
        !employee ||
        employee.name !== row.name ||
        employee.division !== row.division ||
        employee.department !== row.department
      )
        errors.push({
          row: n,
          field: 'no_reg',
          code: 'EMPLOYEE_MISMATCH',
          message: 'Manager must exactly match active Employee master',
        });
      if (employee?.account?.role === Role.SECTION_HEAD)
        errors.push({
          row: n,
          field: 'no_reg',
          code: 'RESPONDER_ROLE_CONFLICT',
          message: 'Section Head must be removed before Manager promotion',
        });
      if (
        employee?.account &&
        employee.account.role !== Role.MEMBER &&
        employee.account.role !== Role.MANAGER
      )
        errors.push({
          row: n,
          field: 'no_reg',
          code: 'ACCOUNT_ROLE_CONFLICT',
          message: 'Admin and Union accounts cannot be promoted as Managers',
        });
      if (!Object.values(Area).includes(row.area as Area))
        errors.push({ row: n, field: 'area', code: 'INVALID_AREA', message: 'Unknown area' });
      if (!['0', '1'].includes(row.is_safety) || !['0', '1'].includes(row.is_facility))
        errors.push({
          row: n,
          field: 'flags',
          code: 'INVALID_FLAG',
          message: 'Flags must be 0 or 1',
        });
    });
    const unique = (key: (r: Record<string, string>) => string | null, label: string) => {
      const counts = new Map<string, number>();
      rows.forEach((r) => {
        const k = key(r);
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      });
      for (const [keyValue, count] of counts)
        if (count !== 1)
          errors.push({
            row: 1,
            field: label,
            code: 'ROUTE_DUPLICATE',
            message: `${label} ${keyValue} has ${count} managers`,
          });
    };
    unique((r) => (r.is_safety === '1' ? r.area : null), 'safety_area');
    unique((r) => (r.is_facility === '1' ? r.area : null), 'facility_area');
    unique(
      (r) => (r.is_safety === '0' && r.is_facility === '0' ? r.department : null),
      'department',
    );
    for (const area of Object.values(Area)) {
      if (!rows.some((r) => r.area === area && r.is_safety === '1'))
        errors.push({
          row: 1,
          field: 'is_safety',
          code: 'ROUTE_MISSING',
          message: `Missing Safety Manager for ${area}`,
        });
      if (!rows.some((r) => r.area === area && r.is_facility === '1'))
        errors.push({
          row: 1,
          field: 'is_facility',
          code: 'ROUTE_MISSING',
          message: `Missing Facility Manager for ${area}`,
        });
    }
    const departments = await this.prisma.employee.findMany({
      where: { active: true },
      distinct: ['department'],
      select: { department: true },
    });
    for (const { department } of departments)
      if (
        !rows.some(
          (row) =>
            row.department === department && row.is_safety === '0' && row.is_facility === '0',
        )
      )
        errors.push({
          row: 1,
          field: 'department',
          code: 'ROUTE_MISSING',
          message: `Missing regular Manager for ${department}`,
        });
  }
  private async applyEmployees(tx: any, rows: Record<string, string>[]) {
    for (const row of rows) {
      const employee = await tx.employee.upsert({
        where: { noReg: row.no_reg },
        update: {
          name: row.name,
          division: row.division,
          department: row.department,
          active: true,
        },
        create: {
          noReg: row.no_reg,
          name: row.name,
          division: row.division,
          department: row.department,
        },
      });
      const existing = await tx.userAccount.findUnique({ where: { username: row.no_reg } });
      if (!existing)
        await tx.userAccount.create({
          data: {
            employeeId: employee.id,
            username: row.no_reg,
            displayName: row.name,
            passwordHash: await hash(row.no_reg),
            role: Role.MEMBER,
          },
        });
    }
  }
  private async applyManagers(tx: any, rows: Record<string, string>[]) {
    const listed = rows.map((r) => r.no_reg);
    await tx.managerProfile.updateMany({
      where: { active: true, employee: { noReg: { in: listed } } },
      data: { active: false },
    });
    const absent = await tx.managerProfile.findMany({
      where: { active: true, employee: { noReg: { notIn: listed } } },
    });
    for (const profile of absent) {
      const active = await tx.voice.count({
        where: {
          OR: [{ routeOwnerId: profile.accountId }, { currentHandlerId: profile.accountId }],
          status: { in: [VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
        },
      });
      if (active)
        throw conflict(
          'MANAGER_SNAPSHOT_ACTIVE_VOICE',
          'Manager omitted from snapshot owns active Voices',
          { managerAccountId: profile.accountId, activeVoiceCount: active },
        );
      const activeSectionHeads = await tx.sectionHeadRelation.count({
        where: { managerId: profile.accountId, active: true },
      });
      if (activeSectionHeads)
        throw conflict(
          'MANAGER_SNAPSHOT_SECTION_HEADS',
          'Manager omitted from snapshot still owns active Section Head relations',
          { managerAccountId: profile.accountId, activeSectionHeadCount: activeSectionHeads },
        );
      await tx.managerProfile.update({ where: { id: profile.id }, data: { active: false } });
      await tx.userAccount.update({
        where: { id: profile.accountId },
        data: { role: Role.MEMBER },
      });
    }
    for (const row of rows) {
      const employee = await tx.employee.findUniqueOrThrow({
        where: { noReg: row.no_reg },
        include: { account: true },
      });
      await tx.userAccount.update({
        where: { id: employee.account.id },
        data: { role: Role.MANAGER, active: true },
      });
      await tx.managerProfile.upsert({
        where: { employeeId: employee.id },
        update: {
          accountId: employee.account.id,
          area: row.area as Area,
          department: row.department,
          isSafety: row.is_safety === '1',
          isFacility: row.is_facility === '1',
          active: true,
        },
        create: {
          employeeId: employee.id,
          accountId: employee.account.id,
          area: row.area as Area,
          department: row.department,
          isSafety: row.is_safety === '1',
          isFacility: row.is_facility === '1',
        },
      });
    }
  }
  private async applyUnion(tx: any, row: Record<string, string>) {
    const existing = await tx.userAccount.findFirst({ where: { role: Role.UNION, active: true } });
    if (existing && existing.username !== row.username) {
      const active = await tx.voice.count({
        where: {
          routeOwnerId: existing.id,
          status: { in: [VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
        },
      });
      if (active)
        throw conflict(
          'UNION_REPLACEMENT_ACTIVE_VOICE',
          'Existing Union owns active Private Voices',
        );
      await tx.userAccount.update({ where: { id: existing.id }, data: { active: false } });
    }
    const found = await tx.userAccount.findUnique({ where: { username: row.username } });
    if (found)
      await tx.userAccount.update({
        where: { id: found.id },
        data: { displayName: row.display_name, role: Role.UNION, active: true },
      });
    else
      await tx.userAccount.create({
        data: {
          username: row.username,
          displayName: row.display_name,
          role: Role.UNION,
          passwordHash: await hash(row.username),
        },
      });
  }
  private safePath(root: string, key: string) {
    const path = resolve(root, key);
    if (!path.startsWith(`${root}${sep}`)) throw new Error('Unsafe import storage path');
    return path;
  }
}
