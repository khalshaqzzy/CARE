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
  if (caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER', 'CARE_ADMIN'].includes(c)))
    throw forbiddenAsNotFound();
  // Director reads every unit the way a Division Head reads their division.
  const leader = caps.includes('DIVISION_LEADERSHIP') || caps.includes('DIRECTOR');
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
      organizationUnit: {
        select: { department: true, shopLocation: { select: { status: true } } },
      },
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
      // Lines exist in production shops; elsewhere the Section Head is the first responder.
      if (level === 'GROUP_LEADER' && m.organizationUnit.shopLocation?.status !== 'ACTIVE')
        continue;
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
    const rows = await this.measure(ids, dashboardSql(context.where));
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
        specialHandling: Number(row.specialHandling),
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
  /**
   * The viewer's own handling figures, with the same attribution their leader
   * sees in Performa Responder, over the same cohort as the dashboard.
   */
  async mine(actor: AuthActor, input: DashboardQuery) {
    const caps = actor.capabilities;
    if (caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER', 'DIRECTOR', 'CARE_ADMIN'].includes(c)))
      throw forbiddenAsNotFound();
    if (
      !caps.some((c) =>
        ['DIVISION_LEADERSHIP', 'MANAGER', 'SECTION_HEAD', 'GROUP_LEADER'].includes(c),
      )
    )
      throw forbiddenAsNotFound();
    const context = await new OrganizationDashboard(this.db).context(
      actor,
      { ...input, basis: 'HANDLING', visibility: 'GENERAL' },
      'scope',
    );
    const [row] = await this.measure([actor.accountId], dashboardSql(context.where));
    const held = Number(row!.held);
    const onTime = Math.max(0, held - Number(row!.late));
    return {
      held,
      onTime,
      onTimeRate: held ? onTime / held : null,
      autoEscalated: Number(row!.autoEscalated),
      overdue: Number(row!.overdue),
      specialHandling: Number(row!.specialHandling),
      averageResponseSeconds: row!.averageResponseSeconds,
      responseSampleCount: Number(row!.responseCount),
      averageCompletionSeconds: row!.averageCompletionSeconds,
      completionSampleCount: Number(row!.completionCount),
      averageRating: row!.averageRating,
      ratingCount: Number(row!.ratingCount),
    };
  }

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

  /**
   * Handling figures per person over a handling cohort. Every figure traces
   * to recorded events: who held the Voice, who answered, whose deadline passed.
   */
  private measure(ids: string[], sql: Prisma.Sql) {
    return this.db.$queryRaw<
      Array<{
        accountId: string;
        held: bigint;
        autoEscalated: bigint;
        overdue: bigint;
        late: bigint;
        specialHandling: bigint;
        averageResponseSeconds: number | null;
        averageRating: number | null;
        ratingCount: bigint;
        responseCount: bigint;
        averageCompletionSeconds: number | null;
        completionCount: bigint;
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
        WHERE e.type::text IN ('RESPONDED', 'MONITORED', 'PROCEEDED', 'CLOSED', 'ESCALATED', 'DEADLINE_MISSED')
      ),
      -- Every figure is grouped per person in one pass, so the cost grows with the
      -- cohort, not with people × cohort (a Director measures every leader at once).
      reached AS (
        SELECT x.pid, x.id FROM (
          SELECT c."currentHandlerId" AS pid, c.id FROM cohort c
          UNION SELECT unnest(c."tierHolderIds"), c.id FROM cohort c
          UNION SELECT unnest(c."tierLowerHolderIds"), c.id FROM cohort c
          UNION SELECT unnest(c."tierObserverIds"), c.id FROM cohort c
          UNION SELECT unnest(c."tierParticipantIds"), c.id FROM cohort c
          UNION SELECT e."actorId", e."voiceId" FROM events e
            WHERE e.type IN ('RESPONDED', 'MONITORED', 'PROCEEDED', 'CLOSED')
          UNION SELECT h.pid::uuid, e."voiceId" FROM events e
            CROSS JOIN LATERAL jsonb_array_elements_text(
              COALESCE(e.payload->'holders', '[]'::jsonb) || COALESCE(e.payload->'previousHolders', '[]'::jsonb)
            ) h(pid)
            WHERE e.type = 'ESCALATED'
        ) x JOIN people p ON p.pid = x.pid
      ),
      -- Older automatic escalations carry only the former holder as the actor.
      missed AS (
        SELECT DISTINCT COALESCE(h.pid::uuid, e."actorId") AS pid, e."voiceId" AS id FROM events e
          LEFT JOIN LATERAL jsonb_array_elements_text(e.payload->'previousHolders') h(pid) ON TRUE
          WHERE e.type = 'ESCALATED' AND e.payload->>'automatic' = 'true'
      ),
      -- A fixed-category window missed at the route owner: late, not moved up.
      deadline_missed AS (
        SELECT DISTINCT COALESCE(h.pid::uuid, e."actorId") AS pid, e."voiceId" AS id FROM events e
          LEFT JOIN LATERAL jsonb_array_elements_text(e.payload->'previousHolders') h(pid) ON TRUE
          WHERE e.type = 'DEADLINE_MISSED'
      ),
      -- Penanganan Khusus has no deadline: out of timeliness, counted apart.
      special AS (
        SELECT c."currentHandlerId" AS pid, c.id FROM cohort c
        WHERE c.status = 'IN_PROGRESS' AND EXISTS (
          SELECT 1 FROM "VoiceHandlingTarget" t WHERE t."voiceId" = c.id
            AND t."cycleNumber" = c."handlingCycleNumber" AND t.kind = 'SPECIAL')
      ),
      overdue AS (
        SELECT c."currentHandlerId" AS pid, c.id FROM cohort c
        WHERE c.status = 'IN_PROGRESS' AND EXISTS (
          SELECT 1 FROM "VoiceHandlingTarget" t WHERE t."voiceId" = c.id
            AND t."cycleNumber" = c."handlingCycleNumber" AND t."dueAt" < now())
      ),
      held AS (
        SELECT x.pid, count(DISTINCT x.id) AS n FROM (
          SELECT pid, id FROM reached UNION SELECT pid, id FROM missed
          UNION SELECT pid, id FROM deadline_missed
        ) x WHERE NOT EXISTS (SELECT 1 FROM special s WHERE s.pid = x.pid AND s.id = x.id)
        GROUP BY x.pid
      ),
      late AS (
        SELECT x.pid, count(DISTINCT x.id) AS n FROM (
          SELECT pid, id FROM missed UNION SELECT pid, id FROM deadline_missed
          UNION SELECT pid, id FROM overdue
        ) x WHERE NOT EXISTS (SELECT 1 FROM special s WHERE s.pid = x.pid AND s.id = x.id)
        GROUP BY x.pid
      ),
      -- Response time runs from when the Voice reached the person, not from submit.
      responses AS (
        SELECT e."actorId" AS pid, e."voiceId", min(e."occurredAt") AS at FROM events e
        WHERE e.type IN ('RESPONDED', 'MONITORED') GROUP BY 1, 2
      ),
      escalations AS (
        SELECT e."voiceId", h.pid::uuid AS pid, e."occurredAt" FROM events e
          CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.payload->'holders', '[]'::jsonb)) h(pid)
          WHERE e.type = 'ESCALATED'
      ),
      response_times AS (
        SELECT r.pid, EXTRACT(EPOCH FROM r.at - GREATEST(c."submittedAt",
          COALESCE(max(x."occurredAt"), c."submittedAt")))::float8 AS seconds
        FROM responses r JOIN cohort c ON c.id = r."voiceId"
        LEFT JOIN escalations x ON x."voiceId" = r."voiceId" AND x.pid = r.pid AND x."occurredAt" <= r.at
        GROUP BY r.pid, r."voiceId", r.at, c."submittedAt"
      ),
      response AS (
        SELECT pid, avg(seconds) AS average, count(*) AS n FROM response_times
        WHERE seconds >= 0 GROUP BY pid
      ),
      -- Closures the person performed, timed over the cycle they closed.
      completions AS (
        SELECT cc."actorId" AS pid, EXTRACT(EPOCH FROM cc."closedAt" - CASE
          WHEN cc."cycleNumber" = 1 THEN c."submittedAt" ELSE prev."reopenedAt" END)::float8 AS seconds
        FROM cohort c JOIN "ClosureCycle" cc ON cc."voiceId" = c.id
        LEFT JOIN "ClosureCycle" prev ON prev."voiceId" = cc."voiceId"
          AND prev."cycleNumber" = cc."cycleNumber" - 1
      ),
      completion AS (
        SELECT pid, avg(seconds) AS average, count(*) AS n FROM completions
        WHERE seconds >= 0 GROUP BY pid
      ),
      auto AS (SELECT pid, count(DISTINCT id) AS n FROM missed GROUP BY pid),
      overdue_n AS (SELECT pid, count(DISTINCT id) AS n FROM overdue GROUP BY pid),
      special_n AS (SELECT pid, count(DISTINCT id) AS n FROM special GROUP BY pid),
      ratings AS (
        SELECT cc."actorId" AS pid, avg(r.score)::float8 AS average, count(r.score) AS n
        FROM cohort c JOIN "ClosureCycle" cc ON cc."voiceId" = c.id
        JOIN "Rating" r ON r."closureCycleId" = cc.id GROUP BY 1
      )
      SELECT p.pid::text AS "accountId",
        COALESCE(held.n, 0) AS held,
        COALESCE(auto.n, 0) AS "autoEscalated",
        COALESCE(overdue_n.n, 0) AS overdue,
        COALESCE(late.n, 0) AS late,
        COALESCE(special_n.n, 0) AS "specialHandling",
        response.average AS "averageResponseSeconds",
        COALESCE(response.n, 0) AS "responseCount",
        completion.average AS "averageCompletionSeconds",
        COALESCE(completion.n, 0) AS "completionCount",
        rt.average AS "averageRating", COALESCE(rt.n, 0) AS "ratingCount"
      FROM people p
      LEFT JOIN held ON held.pid = p.pid
      LEFT JOIN late ON late.pid = p.pid
      LEFT JOIN auto ON auto.pid = p.pid
      LEFT JOIN overdue_n ON overdue_n.pid = p.pid
      LEFT JOIN special_n ON special_n.pid = p.pid
      LEFT JOIN response ON response.pid = p.pid
      LEFT JOIN completion ON completion.pid = p.pid
      LEFT JOIN ratings rt ON rt.pid = p.pid`);
  }
}
