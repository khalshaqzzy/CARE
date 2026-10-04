import { Prisma } from '@prisma/client';
import type { AuthActor } from '../auth/auth.types';
import { leaderLevel } from '../away/away';
import { forbiddenAsNotFound } from '../common/errors';
import type { PrismaService } from '../prisma.service';
import {
  dashboardSql,
  decodeOrganization,
  OrganizationDashboard,
  type DashboardQuery,
} from './dashboard';

type Role = 'GROUP_LEADER' | 'SECTION_HEAD' | 'MANAGER';
type Db = PrismaService | Prisma.TransactionClient;

/** Section Head and above see who handles and who reports; Group Leaders do not. */
function viewer(actor: AuthActor) {
  const caps = actor.capabilities;
  if (caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER', 'DIRECTOR', 'CARE_ADMIN'].includes(c)))
    throw forbiddenAsNotFound();
  const leader = caps.includes('DIVISION_LEADERSHIP');
  const manager = caps.includes('MANAGER');
  const sectionHead = caps.includes('SECTION_HEAD');
  if (!leader && !manager && !sectionHead) throw forbiddenAsNotFound();
  const roles: Role[] = leader
    ? ['MANAGER', 'SECTION_HEAD', 'GROUP_LEADER']
    : manager
      ? ['SECTION_HEAD', 'GROUP_LEADER']
      : ['GROUP_LEADER'];
  return { roles, sectionOnly: !leader && !manager };
}

/**
 * People in the organization the dashboard filters currently select, from the
 * active organization snapshot. A Section Head only ever sees their Section.
 */
async function membersInScope(
  db: Db,
  actor: AuthActor,
  selected: Partial<Record<'directorate' | 'division' | 'department' | 'section', string>>,
  sectionOnly: boolean,
) {
  const deepest = (['section', 'department', 'division', 'directorate'] as const).find(
    (level) => selected[level],
  );
  const path = deepest ? decodeOrganization(selected[deepest]!) : [];
  const unitWhere: Prisma.OrganizationUnitWhereInput = {
    ...(path[0] ? { directorate: path[0] } : {}),
    ...(path[1] ? { division: path[1] } : {}),
    ...(path[2] ? { department: path[2] } : {}),
  };
  const section = sectionOnly ? actor.section : path[3];
  if (sectionOnly && !section) throw forbiddenAsNotFound();
  return db.organizationMembership.findMany({
    where: {
      snapshot: { status: 'ACTIVE' },
      organizationUnit: unitWhere,
      ...(section ? { section } : {}),
    },
    select: {
      employeeId: true,
      employeeName: true,
      structuralPosition: true,
      section: true,
      lineName: true,
      organizationUnit: { select: { department: true } },
      employee: {
        select: {
          account: { select: { id: true, displayName: true, passwordChangeRequired: true } },
        },
      },
    },
    orderBy: { employeeName: 'asc' },
  });
}

export class DashboardPeople {
  constructor(private readonly db: Db) {}

  /**
   * Handling performance of the leaders below the viewer, over the same
   * handling cohort and filters as the dashboard. Every figure traces to
   * recorded events: who held the Voice, who answered, whose deadline passed.
   */
  async handlers(actor: AuthActor, input: DashboardQuery) {
    const { roles, sectionOnly } = viewer(actor);
    const context = await new OrganizationDashboard(this.db).context(
      actor,
      { ...input, basis: 'HANDLING', visibility: 'GENERAL' },
      'scope',
    );
    const members = await membersInScope(this.db, actor, context.metadata.selected, sectionOnly);
    const people = new Map<
      string,
      { accountId: string; name: string; role: Role; unitLabel: string }
    >();
    for (const m of members) {
      const level = leaderLevel(m.structuralPosition);
      const account = m.employee.account;
      if (!account || account.id === actor.accountId) continue;
      if (!level || level === 'DIVISION' || !roles.includes(level)) continue;
      if (people.has(account.id)) continue;
      const unitLabel =
        level === 'MANAGER'
          ? m.organizationUnit.department
          : level === 'SECTION_HEAD'
            ? m.section
            : [m.section, m.lineName].filter(Boolean).join(' · ');
      people.set(account.id, {
        accountId: account.id,
        name: account.displayName,
        role: level,
        unitLabel,
      });
    }
    const ids = [...people.keys()];
    if (!ids.length) return { items: [] };
    const sql = dashboardSql(context.where);
    const rows = await this.db.$queryRaw<
      Array<{
        accountId: string;
        held: bigint;
        autoEscalated: bigint;
        overdue: bigint;
        late: bigint;
        averageResponseSeconds: number | null;
        averageRating: number | null;
        ratingCount: bigint;
      }>
    >(Prisma.sql`
      WITH cohort AS MATERIALIZED (
        SELECT v.id, v."submittedAt", v.status, v."currentHandlerId", v."handlingCycleNumber",
          v."tierHolderIds", v."tierLowerHolderIds", v."tierObserverIds", v."tierParticipantIds"
        FROM "Voice" v WHERE ${sql}
      ),
      people AS (SELECT unnest(${ids}::uuid[]) AS pid),
      events AS MATERIALIZED (
        SELECT e."voiceId", e.type::text AS type, e."actorId", e.payload, e."occurredAt"
        FROM cohort c JOIN "VoiceEvent" e ON e."voiceId" = c.id
        WHERE e.type::text IN ('RESPONDED', 'MONITORED', 'PROCEEDED', 'CLOSED', 'ESCALATED')
      ),
      reached AS (
        SELECT p.pid, c.id FROM people p JOIN cohort c ON p.pid = c."currentHandlerId"
          OR p.pid = ANY(c."tierHolderIds") OR p.pid = ANY(c."tierLowerHolderIds")
          OR p.pid = ANY(c."tierObserverIds") OR p.pid = ANY(c."tierParticipantIds")
        UNION
        SELECT e."actorId", e."voiceId" FROM events e
          WHERE e.type IN ('RESPONDED', 'MONITORED', 'PROCEEDED', 'CLOSED')
        UNION
        SELECT h.pid::uuid, e."voiceId" FROM events e
          CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(e.payload->'holders', '[]'::jsonb) || COALESCE(e.payload->'previousHolders', '[]'::jsonb)
          ) h(pid)
          WHERE e.type = 'ESCALATED'
      ),
      -- Older automatic escalations carry only the former holder as the actor.
      missed AS (
        SELECT DISTINCT COALESCE(h.pid::uuid, e."actorId") AS pid, e."voiceId" AS id FROM events e
          LEFT JOIN LATERAL jsonb_array_elements_text(e.payload->'previousHolders') h(pid) ON TRUE
          WHERE e.type = 'ESCALATED' AND e.payload->>'automatic' = 'true'
      ),
      overdue AS (
        SELECT c."currentHandlerId" AS pid, c.id FROM cohort c
        WHERE c.status = 'IN_PROGRESS' AND EXISTS (
          SELECT 1 FROM "VoiceHandlingTarget" t WHERE t."voiceId" = c.id
            AND t."cycleNumber" = c."handlingCycleNumber" AND t."dueAt" < now())
      ),
      -- Response time runs from when the Voice reached the person, not from submit.
      responses AS (
        SELECT e."actorId" AS pid, e."voiceId", min(e."occurredAt") AS at FROM events e
        WHERE e.type IN ('RESPONDED', 'MONITORED') GROUP BY 1, 2
      ),
      response_times AS (
        SELECT r.pid, EXTRACT(EPOCH FROM r.at - GREATEST(c."submittedAt", COALESCE((
          SELECT max(e."occurredAt") FROM events e WHERE e."voiceId" = r."voiceId"
            AND e.type = 'ESCALATED' AND e."occurredAt" <= r.at
            AND e.payload->'holders' @> jsonb_build_array(r.pid::text)
        ), c."submittedAt")))::float8 AS seconds
        FROM responses r JOIN cohort c ON c.id = r."voiceId"
      ),
      ratings AS (
        SELECT cc."actorId" AS pid, avg(r.score)::float8 AS average, count(r.score) AS n
        FROM cohort c JOIN "ClosureCycle" cc ON cc."voiceId" = c.id
        JOIN "Rating" r ON r."closureCycleId" = cc.id GROUP BY 1
      )
      SELECT p.pid::text AS "accountId",
        (SELECT count(DISTINCT x.id) FROM (SELECT id FROM reached WHERE pid = p.pid
          UNION SELECT id FROM missed WHERE pid = p.pid) x) AS held,
        (SELECT count(DISTINCT id) FROM missed WHERE pid = p.pid) AS "autoEscalated",
        (SELECT count(DISTINCT id) FROM overdue WHERE pid = p.pid) AS overdue,
        (SELECT count(*) FROM (SELECT id FROM missed WHERE pid = p.pid
          UNION SELECT id FROM overdue WHERE pid = p.pid) late) AS late,
        (SELECT avg(seconds) FROM response_times WHERE pid = p.pid AND seconds >= 0) AS "averageResponseSeconds",
        rt.average AS "averageRating", COALESCE(rt.n, 0) AS "ratingCount"
      FROM people p LEFT JOIN ratings rt ON rt.pid = p.pid`);
    const items = rows.map((row) => {
      const person = people.get(row.accountId)!;
      const held = Number(row.held);
      return {
        ...person,
        held,
        onTimeRate: held ? Math.max(0, held - Number(row.late)) / held : null,
        autoEscalated: Number(row.autoEscalated),
        averageResponseSeconds: row.averageResponseSeconds,
        overdue: Number(row.overdue),
        averageRating: row.averageRating,
        ratingCount: Number(row.ratingCount),
      };
    });
    return {
      items: items.sort(
        (a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || a.name.localeCompare(b.name),
      ),
    };
  }

  /**
   * Members of the viewer's reporting scope and how many Voices each sent in
   * the selected period. Counts include Private Voices; their content and
   * route are never exposed here.
   */
  async participation(actor: AuthActor, input: DashboardQuery) {
    const { sectionOnly } = viewer(actor);
    const context = await new OrganizationDashboard(this.db).context(
      actor,
      { ...input, basis: 'REPORTER', visibility: 'GENERAL' },
      'scope',
    );
    const members = await membersInScope(this.db, actor, context.metadata.selected, sectionOnly);
    const unique = new Map<string, (typeof members)[number]>();
    for (const m of members)
      if (m.employee.account?.id !== actor.accountId && !unique.has(m.employeeId))
        unique.set(m.employeeId, m);
    const accountIds = [...unique.values()]
      .map((m) => m.employee.account?.id)
      .filter((id): id is string => Boolean(id));
    const q = context.q;
    const counts = accountIds.length
      ? await this.db.voice.groupBy({
          by: ['reporterId'],
          where: {
            reporterId: { in: accountIds },
            ...(q.from || q.to
              ? {
                  submittedAt: {
                    ...(q.from ? { gte: new Date(q.from) } : {}),
                    ...(q.to ? { lte: new Date(q.to) } : {}),
                  },
                }
              : {}),
          },
          _count: { _all: true },
          _max: { submittedAt: true },
        })
      : [];
    const byReporter = new Map(counts.map((row) => [row.reporterId, row]));
    const items = [...unique.values()].map((m) => {
      const account = m.employee.account;
      const row = account ? byReporter.get(account.id) : undefined;
      return {
        id: m.employeeId,
        name: account?.displayName ?? m.employeeName,
        unitLabel: [m.section, m.lineName].filter(Boolean).join(' · '),
        voiceCount: row?._count._all ?? 0,
        lastSubmittedAt: row?._max.submittedAt?.toISOString() ?? null,
        activated: Boolean(account && !account.passwordChangeRequired),
      };
    });
    return { memberCount: items.length, members: items };
  }
}
