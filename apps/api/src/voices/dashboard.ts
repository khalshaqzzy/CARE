import { Area, Prisma, Severity, VoiceStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import type { PolicyService } from '../auth/policy.service';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import type { PrismaService } from '../prisma.service';

export const dashboardQuerySchema = z
  .object({
    basis: z.enum(['HANDLING', 'REPORTER']).default('HANDLING'),
    visibility: z.enum(['GENERAL', 'PRIVATE']).default('GENERAL'),
    level: z.enum(['division', 'department', 'section']).optional(),
    directorate: z.string().max(1600).optional(),
    division: z.string().max(1600).optional(),
    department: z.string().max(1600).optional(),
    section: z.string().max(1600).optional(),
    handler: z.string().uuid().optional(),
    area: z.nativeEnum(Area).optional(),
    category: z.string().max(80).optional(),
    severity: z.nativeEnum(Severity).optional(),
    status: z.nativeEnum(VoiceStatus).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.from && q.to && new Date(q.from) > new Date(q.to))
      ctx.addIssue({ code: 'custom', message: 'Tanggal akhir harus setelah tanggal awal' });
  });
export type DashboardQuery = z.input<typeof dashboardQuerySchema>;
type Query = z.output<typeof dashboardQuerySchema>;
type Level = 'directorate' | 'division' | 'department' | 'section';
type Unit = { id: string; directorate: string; division: string; department: string };
export type OrgOption = { id: string; label: string; parentId: string | null };
export type DashboardBucket = {
  id?: string;
  label: string;
  value: number;
  key?: string;
  name?: string;
};
const levels: Level[] = ['directorate', 'division', 'department', 'section'];
const count = <T extends { value: bigint | number }>(rows: T[]) =>
  rows.map((r) => ({ ...r, value: Number(r.value) }));
export const organizationKey = (parts: string[]) =>
  Buffer.from(JSON.stringify(parts)).toString('base64url');
function parts(id: string): string[] {
  try {
    const value: unknown = JSON.parse(Buffer.from(id, 'base64url').toString());
    if (
      Array.isArray(value) &&
      value.length &&
      value.length <= 4 &&
      value.every((v) => typeof v === 'string' && v.length <= 200) &&
      organizationKey(value) === id
    )
      return value as string[];
  } catch {
    /* Invalid opaque identifiers are rejected below. */
  }
  throw badRequest('INVALID_ORGANIZATION', 'Pilihan organisasi tidak valid');
}
function parse(input: unknown): Query {
  const result = dashboardQuerySchema.safeParse(input);
  if (!result.success) throw badRequest('INVALID_DASHBOARD_FILTER', 'Filter dashboard tidak valid');
  return result.data;
}
function fields(basis: Query['basis']) {
  const prefix = basis === 'HANDLING' ? 'handling' : 'reporter';
  return levels.map((level) => `${prefix}${level[0]!.toUpperCase()}${level.slice(1)}Snapshot`);
}
const column = (name: string) => Prisma.raw(`v."${name}"`);
// Input to this serializer is exclusively the server-built scalar predicate below.
export function dashboardSql(where: Prisma.VoiceWhereInput): Prisma.Sql {
  const result: Prisma.Sql[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR') {
      const values = Array.isArray(value) ? value : [value];
      result.push(
        values.length
          ? Prisma.sql`(${Prisma.join(
              values.map((v) => dashboardSql(v as Prisma.VoiceWhereInput)),
              key === 'AND' ? ' AND ' : ' OR ',
            )})`
          : Prisma.sql`FALSE`,
      );
    } else if (key === 'legacyAccess') {
      const accountId = (value as { some: { accountId: string } }).some.accountId;
      result.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "LegacyVoiceAccess" l WHERE l."voiceId" = v.id AND l."accountId" = ${accountId}::uuid AND l."effectiveTo" IS NULL)`,
      );
    } else if (key === 'submittedAt') {
      const dates = value as { gte?: Date; lte?: Date; lt?: Date };
      if (dates.gte) result.push(Prisma.sql`v."submittedAt" >= ${dates.gte}`);
      if (dates.lte) result.push(Prisma.sql`v."submittedAt" <= ${dates.lte}`);
      if (dates.lt) result.push(Prisma.sql`v."submittedAt" < ${dates.lt}`);
    } else if (value === null) result.push(Prisma.sql`${column(key)} IS NULL`);
    else if (typeof value === 'object') {
      const values = (value as { in?: string[] }).in;
      if (!values) throw new Error(`Unsupported dashboard predicate: ${key}`);
      result.push(
        values.length
          ? Prisma.sql`${column(key)}::text IN (${Prisma.join(values)})`
          : Prisma.sql`FALSE`,
      );
    } else result.push(Prisma.sql`${column(key)}::text = ${String(value)}`);
  }
  return result.length ? Prisma.join(result, ' AND ') : Prisma.sql`TRUE`;
}

export class OrganizationDashboard {
  constructor(
    private readonly db: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  async context(actor: AuthActor, input: DashboardQuery = {}) {
    const q = parse(input);
    const caps = actor.capabilities;
    const union = caps.includes('UNION_HEAD') || caps.includes('UNION_OFFICER');
    const global = union || caps.includes('DIRECTOR') || caps.includes('CARE_ADMIN');
    const leader = caps.includes('DIVISION_LEADERSHIP');
    const manager = caps.includes('MANAGER');
    if (!global && !leader && !manager && !caps.includes('SECTION_HEAD'))
      throw forbiddenAsNotFound();
    if (q.visibility === 'PRIVATE' && !union) throw forbiddenAsNotFound();
    if (
      q.visibility === 'PRIVATE' &&
      (q.basis === 'REPORTER' || q.category || levels.some((l) => q[l]))
    )
      throw badRequest(
        'PRIVATE_DASHBOARD_FILTER',
        'Private Voice tidak memiliki filter organisasi pelapor',
      );
    if (q.visibility === 'GENERAL' && q.handler)
      throw badRequest('INVALID_DASHBOARD_FILTER', 'Filter PIC hanya tersedia untuk Private Voice');
    const units = await this.db.organizationUnit.findMany({
      orderBy: [{ directorate: 'asc' }, { division: 'asc' }, { department: 'asc' }],
    });
    const mapped = units.filter((u) => actor.routeUnitIds.includes(u.id));
    const own = units.find((u) => u.id === actor.organizationUnitId);
    const preferred =
      actor.structuralPosition?.trim().toLowerCase() === 'department head' && own
        ? own
        : (mapped.find((u) => u.id === own?.id) ?? mapped[0] ?? own);
    const defaultUnit = manager && !leader && !global ? preferred : own;
    const unitParts = (u: Unit) => [u.directorate, u.division, u.department];
    const col = fields(q.basis);
    const forPath = (p: string[]): Prisma.VoiceWhereInput =>
      Object.fromEntries(p.map((v, i) => [col[i]!, v]));
    let scope: Prisma.VoiceWhereInput;
    if (q.visibility === 'PRIVATE')
      scope = caps.includes('UNION_HEAD') ? {} : { currentHandlerId: actor.accountId };
    else if (global || leader) scope = {};
    else if (manager)
      scope = {
        OR: [
          ...(defaultUnit ? [forPath(unitParts(defaultUnit).slice(0, 2))] : []),
          ...mapped.map((u) => forPath(unitParts(u))),
          { routeOwnerId: actor.accountId },
        ],
      };
    else
      scope = {
        OR: [
          { currentHandlerId: actor.accountId },
          { legacyAccess: { some: { accountId: actor.accountId, effectiveTo: null } } },
        ],
      };
    const allowedUnits =
      global || leader
        ? units
        : manager
          ? units.filter(
              (u) =>
                (defaultUnit &&
                  u.directorate === defaultUnit.directorate &&
                  u.division === defaultUnit.division) ||
                mapped.some((m) => m.id === u.id),
            )
          : units.filter((u) => u.id === own?.id);
    const defaultLevel = global ? 'division' : leader ? 'department' : 'section';
    const allowedLevels =
      q.visibility === 'PRIVATE'
        ? ['section']
        : global
          ? ['division', 'department', 'section']
          : leader
            ? ['department', 'division', 'section']
            : manager
              ? ['section', 'department']
              : ['section'];
    const level = q.level ?? (q.visibility === 'PRIVATE' ? 'section' : defaultLevel);
    if (!allowedLevels.includes(level)) throw forbiddenAsNotFound();
    const selections: Partial<Record<Level, string>> = {};
    for (const l of levels)
      if (q[l]) {
        const path = parts(q[l]!);
        if (path.length !== levels.indexOf(l) + 1)
          throw badRequest('INVALID_ORGANIZATION', 'Level organisasi tidak valid');
        for (let i = 0; i < path.length; i++) {
          const parent = levels[i]!;
          const value = organizationKey(path.slice(0, i + 1));
          if (selections[parent] && selections[parent] !== value)
            throw badRequest('INVALID_ORGANIZATION', 'Organisasi tidak sesuai parent');
          selections[parent] = value;
        }
      }
    const hasOrg = levels.some((l) => selections[l]);
    if (!hasOrg && q.visibility === 'GENERAL' && !global && defaultUnit && (manager || leader)) {
      const n = level === 'section' ? 3 : level === 'department' ? 2 : 0;
      for (let i = 0; i < n; i++)
        selections[levels[i]!] = organizationKey(unitParts(defaultUnit).slice(0, i + 1));
    }
    // Metadata is based on authorized master/snapshot labels, never detail rows or reporter identities.
    const options: Record<Level, OrgOption[]> = {
      directorate: [],
      division: [],
      department: [],
      section: [],
    };
    for (let i = 0; i < 3; i++) {
      const seen = new Set<string>();
      for (const u of allowedUnits) {
        const p = unitParts(u).slice(0, i + 1);
        const id = organizationKey(p);
        const parentId = i ? organizationKey(p.slice(0, -1)) : null;
        if (i && selections[levels[i - 1]!] && parentId !== selections[levels[i - 1]!]) continue;
        if (!seen.has(id)) options[levels[i]!].push({ id, label: p[i]!, parentId });
        seen.add(id);
      }
    }
    if (selections.department && q.visibility === 'GENERAL') {
      const path = parts(selections.department);
      const selected = allowedUnits.find((u) => unitParts(u).every((v, i) => v === path[i]));
      if (!selected) throw forbiddenAsNotFound();
      const memberships = await this.db.organizationMembership.findMany({
        where: { organizationUnitId: selected.id },
        distinct: ['section'],
        select: { section: true },
        orderBy: { section: 'asc' },
      });
      options.section = memberships
        .filter((m) => m.section)
        .map((m) => ({
          id: organizationKey([...path, m.section]),
          label: m.section,
          parentId: selections.department!,
        }));
    }
    for (const l of levels)
      if (selections[l] && !options[l].some((o) => o.id === selections[l]))
        throw forbiddenAsNotFound();
    const terms = union
      ? await this.db.unionAccountTerm.findMany({
          where: {
            effectiveTo: null,
            ...(caps.includes('UNION_OFFICER') ? { accountId: actor.accountId } : {}),
          },
          select: { accountId: true, slot: true },
        })
      : [];
    const handlers = terms.map((t) => ({
      id: t.accountId,
      label: t.slot === 'HEAD' ? 'Union Head' : t.slot === 'OFFICER_1' ? 'Union 1' : 'Union 2',
    }));
    if (q.handler && !handlers.some((h) => h.id === q.handler)) throw forbiddenAsNotFound();
    const clauses: Prisma.VoiceWhereInput[] = [{ visibility: q.visibility }, scope];
    const selectedPath = [...levels].reverse().find((l) => selections[l]);
    if (selectedPath) clauses.push(forPath(parts(selections[selectedPath]!)));
    if (q.handler) clauses.push({ currentHandlerId: q.handler });
    if (q.area) clauses.push({ area: q.area });
    if (q.status) clauses.push({ status: q.status });
    if (q.severity) clauses.push({ severity: q.severity });
    if (q.category)
      clauses.push({
        OR: [
          { currentCategoryKey: q.category },
          { currentCategoryKey: null, categoryKey: q.category },
        ],
      });
    const undated: Prisma.VoiceWhereInput = { AND: clauses };
    const where: Prisma.VoiceWhereInput = {
      AND: [
        ...clauses,
        ...(q.from || q.to
          ? [
              {
                submittedAt: {
                  ...(q.from ? { gte: new Date(q.from) } : {}),
                  ...(q.to ? { lte: new Date(q.to) } : {}),
                },
              },
            ]
          : []),
      ],
    };
    const categories =
      q.visibility === 'GENERAL'
        ? await this.db.generalVoiceCategory.findMany({
            select: {
              key: true,
              revisions: { where: { effectiveTo: null }, select: { name: true }, take: 1 },
            },
            orderBy: { key: 'asc' },
          })
        : [];
    return {
      q,
      where,
      undated,
      global,
      col,
      level,
      metadata: {
        basis: q.basis,
        visibility: q.visibility,
        level,
        allowedLevels,
        organization:
          q.visibility === 'GENERAL'
            ? options
            : { directorate: [], division: [], department: [], section: [] },
        selected: selections,
        handlers,
        categories: categories.map((c) => ({ id: c.key, label: c.revisions[0]?.name ?? c.key })),
        scopeLabel:
          q.visibility === 'PRIVATE'
            ? caps.includes('UNION_HEAD')
              ? 'Seluruh Private Voice'
              : 'Penugasan Anda'
            : selections.section
              ? parts(selections.section).at(-1)!
              : selections.department
                ? parts(selections.department).at(-1)!
                : selections.division
                  ? parts(selections.division).at(-1)!
                  : !global && !leader && !manager
                    ? 'Penugasan Anda'
                    : 'Seluruh organisasi',
      },
    };
  }

  async metadata(actor: AuthActor, input: DashboardQuery) {
    return (await this.context(actor, input)).metadata;
  }

  async aggregate(actor: AuthActor, input: DashboardQuery) {
    const c = await this.context(actor, input);
    const { q, where, col, level } = c;
    const sql = dashboardSql(where);
    const [total, inaccessible] = await Promise.all([
      this.db.voice.count({ where }),
      c.global || q.visibility === 'PRIVATE'
        ? 0
        : this.db.voice.count({
            where: { AND: [where, { NOT: await this.policy.detailScope(actor) }] },
          }),
    ]);
    const protectedCohort = inaccessible > 0 && total < 5;
    const protect = inaccessible > 0;
    const orgN = levels.indexOf(level) + 1;
    const groupExpr =
      q.visibility === 'PRIVATE'
        ? Prisma.sql`v."currentHandlerId"::text`
        : Prisma.sql`jsonb_build_array(${Prisma.join(
            col
              .slice(0, orgN)
              .map((name, i) =>
                i === 3 && q.basis === 'HANDLING'
                  ? Prisma.sql`COALESCE(v."handlingSectionSnapshot", CASE WHEN v."handlerType" = 'SECTION_HEAD' THEN '__UNKNOWN_SECTION__' END)`
                  : column(name),
              ),
          )})::text`;
    const metrics = protectedCohort
      ? []
      : await this.db.$queryRaw<
          Array<{ kind: string; label: string | null; value: bigint }>
        >(Prisma.sql`
      WITH scoped AS (SELECT v.* FROM "Voice" v WHERE ${sql})
      SELECT 'status' AS kind, v.status::text AS label, count(*) AS value FROM scoped v GROUP BY 2
      UNION ALL SELECT 'severity', v.severity::text, count(*) FROM scoped v GROUP BY 2
      UNION ALL SELECT 'category', COALESCE(v."currentCategoryKey", v."categoryKey"), count(*) FROM scoped v GROUP BY 2
      UNION ALL SELECT 'organization', ${groupExpr}, count(*) FROM scoped v GROUP BY 2
      UNION ALL SELECT 'area', v.area::text, count(*) FROM scoped v GROUP BY 2`);
    const get = (kind: string): DashboardBucket[] =>
      count(metrics.filter((m) => m.kind === kind)).map((m) => ({
        label: m.label ?? 'NONE',
        value: m.value,
      }));
    const suppressedKinds: string[] = [];
    const safe = (kind: string, buckets: DashboardBucket[]) => {
      // Hiding the whole dimension also prevents total-minus-visible-buckets reconstruction.
      if (protect && buckets.some((b) => b.value > 0 && b.value < 5)) {
        suppressedKinds.push(kind);
        return [];
      }
      return buckets;
    };
    const names = new Map(c.metadata.categories.map((cat) => [cat.id, cat.label]));
    const category = safe(
      'category',
      get('category').map((b) => ({
        ...b,
        key: b.label,
        name: names.get(b.label) ?? 'Tanpa kategori',
        label: names.get(b.label) ?? 'Tanpa kategori',
      })),
    );
    const organization = safe(
      'organization',
      get('organization').map((b) => {
        if (q.visibility === 'PRIVATE')
          return {
            ...b,
            id: b.label,
            label:
              b.label === 'NONE'
                ? 'Belum didelegasikan'
                : (c.metadata.handlers.find((h) => h.id === b.label)?.label ?? 'Union sebelumnya'),
          };
        const p = JSON.parse(b.label) as (string | null)[];
        return {
          ...b,
          id: p.every((v) => v !== null && v !== '__UNKNOWN_SECTION__')
            ? organizationKey(p as string[])
            : undefined,
          label:
            (p.at(-1) === '__UNKNOWN_SECTION__' ? 'Section belum teridentifikasi' : p.at(-1)) ||
            (level === 'section' && p[2]
              ? q.basis === 'HANDLING'
                ? 'Belum ditugaskan ke section'
                : 'Section belum teridentifikasi'
              : 'Organisasi belum teridentifikasi'),
        };
      }),
    ).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const bounds = await this.db.voice.aggregate({
      where,
      _min: { submittedAt: true },
      _max: { submittedAt: true },
    });
    const from = q.from ? new Date(q.from) : bounds._min.submittedAt;
    const to = q.to ? new Date(q.to) : bounds._max.submittedAt;
    const days = from && to ? (to.getTime() - from.getTime()) / 86400000 : 0;
    const grain = days > 730 ? 'month' : days > 100 ? 'week' : 'day';
    const trend =
      protectedCohort || !from || !to
        ? []
        : count(
            await this.db.$queryRaw<Array<{ label: string; value: bigint }>>(Prisma.sql`
      WITH counts AS (SELECT date_trunc(${grain}, v."submittedAt" AT TIME ZONE 'Asia/Jakarta') AS day, count(*) AS value FROM "Voice" v WHERE ${sql} GROUP BY 1)
      SELECT to_char(d.day, 'YYYY-MM-DD') AS label, COALESCE(c.value, 0)::bigint AS value
      FROM generate_series(date_trunc(${grain}, ${from}::timestamptz AT TIME ZONE 'Asia/Jakarta'), date_trunc(${grain}, ${to}::timestamptz AT TIME ZONE 'Asia/Jakarta'), ('1 ' || ${grain})::interval) d(day)
      LEFT JOIN counts c ON c.day = d.day ORDER BY d.day`),
          );
    let previousTotal: number | null = null;
    if (!protectedCohort && q.from && q.to) {
      const end = new Date(q.from),
        duration = new Date(q.to).getTime() - end.getTime() + 1;
      const previousWhere = {
        AND: [c.undated, { submittedAt: { gte: new Date(end.getTime() - duration), lt: end } }],
      };
      const previous = await this.db.voice.count({ where: previousWhere });
      const previousOutside =
        !c.global && q.visibility === 'GENERAL' && previous > 0 && previous < 5
          ? await this.db.voice.count({
              where: { AND: [previousWhere, { NOT: await this.policy.detailScope(actor) }] },
            })
          : 0;
      previousTotal = previousOutside > 0 ? null : previous;
    }
    const missing =
      q.visibility === 'GENERAL' && q.basis === 'HANDLING' && !protectedCohort && !protect
        ? await this.db.voice.count({
            where: { AND: [where, { handlingOrganizationSource: 'UNKNOWN' }] },
          })
        : null;
    const pendingAssignment =
      q.visibility === 'PRIVATE' && actor.capabilities.includes('UNION_HEAD')
        ? await this.db.voice.count({ where: { visibility: 'PRIVATE', currentHandlerId: null } })
        : undefined;
    return {
      ...c.metadata,
      total: protectedCohort ? null : total,
      status: safe('status', get('status')),
      severity: safe('severity', get('severity')),
      category,
      organization,
      trend: safe('trend', trend),
      area: safe('area', get('area')),
      previousTotal,
      trendGrain: grain,
      pendingAssignment,
      protected: protectedCohort,
      suppressedDimensions: suppressedKinds,
      suppression: { enabled: protect, threshold: 5 },
      handlingUnresolved: missing,
      filters: { ...q, ...c.metadata.selected, level },
      generatedAt: new Date().toISOString(),
    };
  }
}
