import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  Area,
  GeneralVoiceCategoryRouteMode,
  Prisma,
  RouteKind,
  ShopLocationStatus,
  ShopResolutionSource,
  VoiceVisibility,
} from '@prisma/client';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { canonicalHash } from '../common/crypto';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { normalizeAlias, normalizeLocationText } from './shop-matching';

const areasSchema = z
  .array(z.nativeEnum(Area))
  .min(1)
  .max(Object.keys(Area).length)
  .refine((areas) => new Set(areas).size === areas.length, 'Area duplikat');
const aliasesSchema = z.array(z.string().trim().min(1).max(60)).max(30);
const createSchema = z
  .object({ organizationUnitId: z.string().uuid(), areas: areasSchema, aliases: aliasesSchema })
  .strict();
const updateSchema = z
  .object({
    areas: areasSchema,
    aliases: aliasesSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();
const statusSchema = z
  .object({
    status: z.nativeEnum(ShopLocationStatus),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

const UNMATCHED_WINDOW_DAYS = 30;

type ShopRow = Prisma.ShopLocationGetPayload<{ include: { organizationUnit: true } }>;

@Injectable()
export class ShopLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active shops operating in an area, used for routing and AI context. */
  async activeForArea(area: Area) {
    const rows = await this.prisma.shopLocation.findMany({
      where: { status: ShopLocationStatus.ACTIVE, areas: { has: area } },
      include: { organizationUnit: true },
      orderBy: [{ organizationUnit: { department: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      organizationUnitId: row.organizationUnitId,
      department: row.organizationUnit.department,
      aliases: row.aliases,
    }));
  }

  async list() {
    const rows = await this.prisma.shopLocation.findMany({
      include: { organizationUnit: true },
      orderBy: [{ organizationUnit: { department: 'asc' } }, { id: 'asc' }],
    });
    return Promise.all(rows.map((row) => this.adminShape(row)));
  }

  async create(actor: AuthActor, body: unknown, key?: string) {
    this.requireKey(key);
    const data = this.parse(createSchema, body);
    const aliases = this.cleanAliases(data.aliases);
    const requestHash = canonicalHash({ ...data, aliases });
    const scope = 'admin:shop-location:create';
    const replay = await this.replay(actor, scope, key!, requestHash);
    if (replay) return replay;
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id: data.organizationUnitId },
    });
    if (!unit) throw badRequest('SHOP_DEPARTMENT_INVALID', 'Department shop tidak valid');
    const created = await this.prisma.$transaction(async (tx) => {
      if (await tx.shopLocation.findUnique({ where: { organizationUnitId: unit.id } }))
        throw conflict('SHOP_LOCATION_EXISTS', 'Department ini sudah terdaftar sebagai shop');
      const row = await tx.shopLocation.create({
        data: { organizationUnitId: unit.id, areas: data.areas, aliases },
      });
      await this.audit(tx, actor, 'SHOP_LOCATION_CREATED', row.id, {
        organizationUnitId: unit.id,
        areas: data.areas,
        aliasCount: aliases.length,
      });
      return row;
    });
    return this.respond(actor, scope, key!, requestHash, created.id);
  }

  async update(actor: AuthActor, id: string, body: unknown, key?: string) {
    this.requireKey(key);
    const data = this.parse(updateSchema, body);
    const aliases = this.cleanAliases(data.aliases);
    const requestHash = canonicalHash({ id, ...data, aliases });
    const scope = `admin:shop-location:update:${id}`;
    const replay = await this.replay(actor, scope, key!, requestHash);
    if (replay) return replay;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.shopLocation.findUnique({ where: { id } });
      if (!current) throw forbiddenAsNotFound();
      if (current.version !== data.expectedVersion)
        throw conflict('SHOP_LOCATION_VERSION_CONFLICT', 'Lokasi shop telah berubah');
      await tx.shopLocation.update({
        where: { id },
        data: { areas: data.areas, aliases, version: { increment: 1 } },
      });
      await this.audit(tx, actor, 'SHOP_LOCATION_UPDATED', id, {
        areas: data.areas,
        aliasCount: aliases.length,
      });
    });
    return this.respond(actor, scope, key!, requestHash, id);
  }

  async setStatus(actor: AuthActor, id: string, body: unknown, key?: string) {
    this.requireKey(key);
    const data = this.parse(statusSchema, body);
    const requestHash = canonicalHash({ id, ...data });
    const scope = `admin:shop-location:status:${id}`;
    const replay = await this.replay(actor, scope, key!, requestHash);
    if (replay) return replay;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.shopLocation.findUnique({ where: { id } });
      if (!current) throw forbiddenAsNotFound();
      if (current.version !== data.expectedVersion)
        throw conflict('SHOP_LOCATION_VERSION_CONFLICT', 'Lokasi shop telah berubah');
      await tx.shopLocation.update({
        where: { id },
        data: { status: data.status, version: { increment: 1 } },
      });
      await this.audit(tx, actor, 'SHOP_LOCATION_STATUS_CHANGED', id, {
        from: current.status,
        to: data.status,
      });
    });
    return this.respond(actor, scope, key!, requestHash, id);
  }

  /**
   * Location texts of recent location-owner Voices that matched no shop,
   * grouped per area, so Admin can add missing aliases.
   */
  async unmatched() {
    const keys = await this.prisma.generalVoiceCategory.findMany({
      where: {
        routes: {
          some: {
            effectiveTo: null,
            mode: GeneralVoiceCategoryRouteMode.LOCATION_OWNER_DEPARTMENT,
          },
        },
      },
      select: { key: true },
    });
    if (!keys.length) return [];
    const voices = await this.prisma.voice.findMany({
      where: {
        visibility: VoiceVisibility.GENERAL,
        shopResolutionSource: ShopResolutionSource.NO_MATCH,
        categoryKey: { in: keys.map((row) => row.key) },
        submittedAt: { gte: new Date(Date.now() - UNMATCHED_WINDOW_DAYS * 86_400_000) },
      },
      select: { area: true, locationDetail: true },
      take: 1000,
    });
    const groups = new Map<string, { area: Area; locationDetail: string; count: number }>();
    for (const voice of voices) {
      const normalized = normalizeLocationText(voice.locationDetail).join(' ');
      const groupKey = `${voice.area}:${normalized}`;
      const group = groups.get(groupKey);
      if (group) group.count += 1;
      else
        groups.set(groupKey, { area: voice.area, locationDetail: voice.locationDetail, count: 1 });
    }
    return [...groups.values()]
      .sort((a, b) => b.count - a.count || a.locationDetail.localeCompare(b.locationDetail))
      .slice(0, 20);
  }

  private cleanAliases(aliases: string[]) {
    const normalized = aliases.map(normalizeAlias).filter(Boolean);
    return [...new Set(normalized)];
  }

  private async adminShape(row: ShopRow) {
    const owners = await this.prisma.routeMapping.findMany({
      where: {
        organizationUnitId: row.organizationUnitId,
        kind: { in: [RouteKind.DEPARTMENT_HEAD, RouteKind.DEFAULT_DEPARTMENT] },
        effectiveTo: null,
        owner: { status: AccountStatus.ACTIVE },
      },
      take: 2,
      include: {
        owner: { select: { id: true, displayName: true, employee: { select: { noReg: true } } } },
      },
    });
    const owner = owners.length === 1 ? owners[0]!.owner : null;
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      updatedAt: row.updatedAt,
      areas: row.areas,
      aliases: row.aliases,
      organizationUnit: {
        id: row.organizationUnit.id,
        directorate: row.organizationUnit.directorate,
        division: row.organizationUnit.division,
        department: row.organizationUnit.department,
      },
      pic: owner
        ? { id: owner.id, name: owner.displayName, noReg: owner.employee?.noReg ?? null }
        : null,
      health: owner ? 'HEALTHY' : 'GAP',
    };
  }

  private async respond(
    actor: AuthActor,
    scope: string,
    key: string,
    requestHash: string,
    id: string,
  ) {
    const row = await this.prisma.shopLocation.findUniqueOrThrow({
      where: { id },
      include: { organizationUnit: true },
    });
    const response = await this.adminShape(row);
    await this.prisma.idempotencyRecord.create({
      data: {
        accountId: actor.accountId,
        scope,
        key,
        requestHash,
        statusCode: 200,
        response: response as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return response;
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
    return record.response as unknown as Awaited<ReturnType<ShopLocationsService['adminShape']>>;
  }

  private requireKey(key?: string) {
    if (!key?.trim()) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required');
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
        resourceType: 'SHOP_LOCATION',
        resourceId,
        summary,
        correlationId: crypto.randomUUID(),
        releaseSha: process.env.RELEASE_SHA ?? 'development',
      },
    });
  }
}
