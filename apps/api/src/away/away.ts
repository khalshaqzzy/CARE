import { AccountStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { divisionLeadershipPositions, normalizedPosition } from '../auth/capabilities';
import { jakartaDateKey } from '../escalation/working-time';

type Db = PrismaClient | Prisma.TransactionClient;

/** WIB calendar day as stored in the DATE columns. */
export const dayDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** Periods covering today (WIB) that were not ended with "Aktif kembali". */
export function activeAwayWhere(now = new Date()): Prisma.AwayPeriodWhereInput {
  const today = dayDate(jakartaDateKey(now));
  return { endedAt: null, startsOn: { lte: today }, endsOn: { gte: today } };
}

/** Accounts the substitute currently acts for. */
export async function delegatorsFor(db: Db, substituteId: string, now = new Date()) {
  const rows = await db.awayPeriod.findMany({
    where: { substituteId, ...activeAwayWhere(now) },
    select: { accountId: true },
  });
  return [...new Set(rows.map((row) => row.accountId))];
}

/** Active substitute for each away account among `ids`. */
export async function activeSubstitutes(db: Db, ids: string[], now = new Date()) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.awayPeriod.findMany({
    where: { accountId: { in: ids }, ...activeAwayWhere(now) },
    orderBy: { createdAt: 'desc' },
    select: { accountId: true, substituteId: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) if (!map.has(row.accountId)) map.set(row.accountId, row.substituteId);
  return map;
}

/**
 * Away accounts whose substitute is away as well: nobody can act for them, so
 * routing passes their level by.
 */
export async function unreachableAccounts(db: Db, ids: string[], now = new Date()) {
  const substitutes = await activeSubstitutes(db, ids, now);
  if (!substitutes.size) return new Set<string>();
  const awaySubstitutes = await activeSubstitutes(db, [...new Set(substitutes.values())], now);
  return new Set(
    [...substitutes.entries()]
      .filter(([, substitute]) => awaySubstitutes.has(substitute))
      .map(([accountId]) => accountId),
  );
}

type Level = 'GROUP_LEADER' | 'SECTION_HEAD' | 'MANAGER' | 'DIVISION';

export function leaderLevel(position: string | null | undefined): Level | null {
  const normalized = normalizedPosition(position);
  if (normalized === 'group leader') return 'GROUP_LEADER';
  if (normalized === 'section head') return 'SECTION_HEAD';
  if (normalized === 'department head') return 'MANAGER';
  if (normalized && divisionLeadershipPositions.has(normalized)) return 'DIVISION';
  return null;
}

/**
 * A substitute works at the same level or one level up in the leader's unit:
 * Group Leader → another Group Leader of the Section or its Section Head;
 * Section Head → another Section Head of the department or its Manager;
 * Manager → another Manager of the division or a Deputy/Division Head;
 * Deputy/Division Head → another Deputy/Division Head of the division.
 */
export async function substituteCandidates(db: Db, accountId: string) {
  const membership = await db.organizationMembership.findFirst({
    where: { employee: { account: { is: { id: accountId } } }, snapshot: { status: 'ACTIVE' } },
    include: { organizationUnit: true },
  });
  const level = leaderLevel(membership?.structuralPosition);
  if (!membership || !level) return { level: null, candidates: [] };
  const unit = membership.organizationUnit;
  const scope: Prisma.OrganizationMembershipWhereInput =
    level === 'GROUP_LEADER'
      ? { organizationUnitId: unit.id, section: membership.section }
      : level === 'SECTION_HEAD'
        ? { organizationUnitId: unit.id }
        : { organizationUnit: { directorate: unit.directorate, division: unit.division } };
  const allowed: Level[] =
    level === 'GROUP_LEADER'
      ? ['GROUP_LEADER', 'SECTION_HEAD']
      : level === 'SECTION_HEAD'
        ? ['SECTION_HEAD', 'MANAGER']
        : level === 'MANAGER'
          ? ['MANAGER', 'DIVISION']
          : ['DIVISION'];
  const rows = await db.organizationMembership.findMany({
    where: {
      snapshotId: membership.snapshotId,
      employee: { account: { is: { status: AccountStatus.ACTIVE } } },
      ...scope,
    },
    select: {
      structuralPosition: true,
      section: true,
      employee: { select: { account: { select: { id: true, displayName: true } } } },
    },
  });
  const order: Level[] = ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER', 'DIVISION'];
  const candidates = rows
    .map((row) => ({ row, rowLevel: leaderLevel(row.structuralPosition) }))
    .filter(
      ({ row, rowLevel }) =>
        rowLevel !== null &&
        allowed.includes(rowLevel) &&
        row.employee.account &&
        row.employee.account.id !== accountId,
    )
    .sort(
      (a, b) =>
        order.indexOf(a.rowLevel!) - order.indexOf(b.rowLevel!) ||
        a.row.employee.account!.displayName.localeCompare(
          b.row.employee.account!.displayName,
          'id',
        ),
    )
    .map(({ row, rowLevel }) => ({
      id: row.employee.account!.id,
      displayName: row.employee.account!.displayName,
      position: row.structuralPosition,
      section: row.section?.trim() || null,
      upperLevel: rowLevel !== level,
    }));
  return { level, candidates };
}
