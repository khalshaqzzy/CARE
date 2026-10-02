import { AccountStatus, type Prisma, type PrismaClient, type TierLevel } from '@prisma/client';
import { divisionLeadershipPositions, normalizedPosition } from '../auth/capabilities';

type Db = PrismaClient | Prisma.TransactionClient;

export const TIER_ORDER: TierLevel[] = ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER', 'DIVISION'];

export type TierStep = { level: TierLevel; accountIds: string[] };

export type TierChainInput = {
  snapshotId: string | null;
  /** The reporter's department; Group Leader and Section Head come from it. */
  reporterOrganizationUnitId: string | null;
  section: string | null;
  line: string | null;
  reporterAccountId: string;
  reporterPosition: string | null;
  /** The route-owning Manager of the handling department. */
  managerAccountId: string;
  /** The handling department; its division supplies the Deputy/Division Heads. */
  handlingOrganizationUnitId: string | null;
  /** Fasilitas Kerja in another department's shop starts at that shop's Manager. */
  outsideReporter: boolean;
};

/** The reporter never handles their own Voice: the chain starts above their level. */
function reporterLevel(position: string | null): number {
  const normalized = normalizedPosition(position);
  if (normalized === 'group leader') return 0;
  if (normalized === 'section head') return 1;
  if (normalized === 'department head') return 2;
  if (normalized && divisionLeadershipPositions.has(normalized)) return 3;
  return -1;
}

/**
 * Bottom-up chain for tiered categories: Group Leader of the reporter's Line,
 * Section Head of their Section, the route-owning Manager, then every
 * Deputy/Division Head of the handling division together. A level is skipped
 * when it is not exactly one active person (the division level takes all).
 */
export async function resolveTierChain(db: Db, input: TierChainInput): Promise<TierStep[]> {
  const steps: TierStep[] = [];
  const active = { account: { is: { status: AccountStatus.ACTIVE } } };
  const leader = async (position: string, extra: Prisma.OrganizationMembershipWhereInput) => {
    if (!input.snapshotId || !input.reporterOrganizationUnitId || !input.section) return [];
    const rows = await db.organizationMembership.findMany({
      where: {
        snapshotId: input.snapshotId,
        organizationUnitId: input.reporterOrganizationUnitId,
        section: input.section,
        structuralPosition: { equals: position, mode: 'insensitive' },
        employee: active,
        ...extra,
      },
      select: { employee: { select: { account: { select: { id: true } } } } },
      take: 2,
    });
    const ids = rows.map((row) => row.employee.account?.id).filter((id): id is string => !!id);
    return ids.length === 1 ? ids : [];
  };
  if (!input.outsideReporter) {
    if (input.line) {
      const groupLeader = await leader('Group Leader', { lineName: input.line });
      if (groupLeader.length) steps.push({ level: 'GROUP_LEADER', accountIds: groupLeader });
    }
    const sectionHead = await leader('Section Head', {});
    if (sectionHead.length) steps.push({ level: 'SECTION_HEAD', accountIds: sectionHead });
  }
  steps.push({ level: 'MANAGER', accountIds: [input.managerAccountId] });
  const unit = input.handlingOrganizationUnitId
    ? await db.organizationUnit.findUnique({ where: { id: input.handlingOrganizationUnitId } })
    : null;
  if (unit && input.snapshotId) {
    const rows = await db.organizationMembership.findMany({
      where: {
        snapshotId: input.snapshotId,
        organizationUnit: { directorate: unit.directorate, division: unit.division },
        employee: active,
      },
      select: {
        structuralPosition: true,
        employee: { select: { account: { select: { id: true } } } },
      },
    });
    const ids = rows
      .filter((row) =>
        divisionLeadershipPositions.has(normalizedPosition(row.structuralPosition) ?? ''),
      )
      .map((row) => row.employee.account?.id)
      .filter((id): id is string => !!id);
    if (ids.length) steps.push({ level: 'DIVISION', accountIds: [...new Set(ids)].sort() });
  }
  const floor = reporterLevel(input.reporterPosition);
  return steps
    .filter((step) => TIER_ORDER.indexOf(step.level) > floor)
    .map((step) => ({
      ...step,
      accountIds: step.accountIds.filter((id) => id !== input.reporterAccountId),
    }))
    .filter((step) => step.accountIds.length > 0);
}

/** The next level above `current` that the chain recorded at submit. */
export function nextTierLevel(path: TierLevel[], current: TierLevel | null): TierLevel | null {
  if (!current) return null;
  const index = path.indexOf(current);
  return index >= 0 && index + 1 < path.length ? path[index + 1]! : null;
}

type VoiceForChain = {
  reporterId: string;
  reporterOrganizationUnitId: string | null;
  reporterSectionSnapshot: string | null;
  reporterLineSnapshot: string | null;
  reporterPositionSnapshot: string | null;
  routeOwnerId: string;
  handlingOrganizationUnitId: string | null;
  outsideReporter: boolean;
};

/** The chain as the active organization snapshot sees it today. */
export async function chainForVoice(db: Db, voice: VoiceForChain) {
  const snapshot = await db.organizationSnapshot.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  return resolveTierChain(db, {
    snapshotId: snapshot?.id ?? null,
    reporterOrganizationUnitId: voice.reporterOrganizationUnitId,
    section: voice.reporterSectionSnapshot,
    line: voice.reporterLineSnapshot,
    reporterAccountId: voice.reporterId,
    reporterPosition: voice.reporterPositionSnapshot,
    managerAccountId: voice.routeOwnerId,
    handlingOrganizationUnitId: voice.handlingOrganizationUnitId,
    outsideReporter: voice.outsideReporter,
  });
}

/** Whether the Section has any active Group Leader a Section Head could assign. */
export async function sectionHasGroupLeader(
  db: Db,
  snapshotId: string | null,
  organizationUnitId: string | null,
  section: string | null,
) {
  if (!snapshotId || !organizationUnitId || !section) return false;
  return Boolean(
    await db.organizationMembership.findFirst({
      where: {
        snapshotId,
        organizationUnitId,
        section,
        structuralPosition: { equals: 'Group Leader', mode: 'insensitive' },
        employee: { account: { is: { status: AccountStatus.ACTIVE } } },
      },
      select: { id: true },
    }),
  );
}

/**
 * Who a tier holder may assign: a Section Head assigns the Group Leaders of
 * the Section; a Manager assigns Group Leaders and Section Heads of the
 * handling department (including levels the chain skipped); the division
 * level also reaches Department Heads across the division.
 */
export async function tierAssignees(
  db: Db,
  level: TierLevel,
  voice: VoiceForChain & {
    handlingDivisionSnapshot: string | null;
    handlingDirectorateSnapshot: string | null;
  },
) {
  const positions =
    level === 'SECTION_HEAD'
      ? ['group leader']
      : level === 'MANAGER'
        ? ['group leader', 'section head']
        : ['group leader', 'section head', 'department head'];
  const where: Prisma.OrganizationMembershipWhereInput =
    level === 'SECTION_HEAD'
      ? {
          organizationUnitId: voice.reporterOrganizationUnitId ?? '__none__',
          section: voice.reporterSectionSnapshot ?? '__none__',
        }
      : level === 'MANAGER'
        ? {
            organizationUnitId:
              voice.handlingOrganizationUnitId ?? voice.reporterOrganizationUnitId ?? '__none__',
          }
        : {
            organizationUnit: {
              directorate: voice.handlingDirectorateSnapshot ?? '__none__',
              division: voice.handlingDivisionSnapshot ?? '__none__',
            },
          };
  const rows = await db.organizationMembership.findMany({
    where: {
      snapshot: { status: 'ACTIVE' },
      employee: { account: { is: { status: AccountStatus.ACTIVE } } },
      ...where,
    },
    select: {
      structuralPosition: true,
      section: true,
      lineName: true,
      employee: { select: { account: { select: { id: true, displayName: true } } } },
    },
  });
  return rows
    .filter((row) => positions.includes(normalizedPosition(row.structuralPosition) ?? ''))
    .filter((row) => row.employee.account && row.employee.account.id !== voice.reporterId)
    .map((row) => ({
      id: row.employee.account!.id,
      displayName: row.employee.account!.displayName,
      structuralPosition: row.structuralPosition,
      section: row.section?.trim() || null,
      line: row.lineName?.trim() || null,
    }));
}
