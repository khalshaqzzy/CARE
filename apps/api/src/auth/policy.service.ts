import { Inject, Injectable } from '@nestjs/common';
import {
  AccountKind,
  AccountStatus,
  Prisma,
  RouteKind,
  UnionSlot,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { forbiddenAsNotFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { type Capability, divisionLeadershipPositions, normalizedPosition } from './capabilities';
import { delegatorsFor } from '../away/away';

export type Principal = {
  accountId: string;
  sessionId: string;
  accountKind: AccountKind;
  accountStatus: AccountStatus;
  username: string;
  employeeId: string | null;
  passwordRestricted: boolean;
  structuralPosition: string | null;
  organizationSnapshotId: string | null;
  organizationUnitId: string | null;
  directorate: string | null;
  division: string | null;
  department: string | null;
  section: string | null;
  /** Production Line; a Group Leader's team is limited to it. */
  line?: string | null;
  /** Accounts on "Sedang tidak masuk" that name this account as substitute today. */
  actingFor?: string[];
  unionSlot: UnionSlot | null;
  capabilities: Capability[];
  routeUnitIds: string[];
  isGlobalPic: boolean;
};

@Injectable()
export class PolicyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolvePrincipal(
    account: {
      id: string;
      username: string;
      accountKind: AccountKind;
      status: AccountStatus;
      employeeId: string | null;
    },
    session: { id: string; passwordRestricted: boolean },
  ): Promise<Principal> {
    const [membership, unionTerm, routes] = await Promise.all([
      account.employeeId
        ? this.prisma.organizationMembership.findFirst({
            where: { employeeId: account.employeeId, snapshot: { status: 'ACTIVE' } },
            include: { snapshot: true, organizationUnit: true },
          })
        : null,
      account.accountKind === AccountKind.UNION
        ? this.prisma.unionAccountTerm.findFirst({
            where: { accountId: account.id, effectiveTo: null },
          })
        : null,
      this.prisma.routeMapping.findMany({
        where: { ownerAccountId: account.id, effectiveTo: null },
        select: { kind: true, organizationUnitId: true },
      }),
    ]);
    const capabilitySet = new Set<Capability>();
    if (account.accountKind === AccountKind.CARE_ADMIN) capabilitySet.add('CARE_ADMIN');
    if (account.accountKind === AccountKind.WORKFORCE) capabilitySet.add('MEMBER');
    if (unionTerm?.slot === UnionSlot.HEAD) capabilitySet.add('UNION_HEAD');
    if (unionTerm?.slot === UnionSlot.OFFICER_1 || unionTerm?.slot === UnionSlot.OFFICER_2)
      capabilitySet.add('UNION_OFFICER');
    const position = normalizedPosition(membership?.structuralPosition);
    if (position === 'group leader') capabilitySet.add('GROUP_LEADER');
    if (position === 'section head') capabilitySet.add('SECTION_HEAD');
    if (position === 'department head') capabilitySet.add('MANAGER');
    if (position && divisionLeadershipPositions.has(position))
      capabilitySet.add('DIVISION_LEADERSHIP');
    if (position === 'director') capabilitySet.add('DIRECTOR');
    if (routes.some((route) => route.kind !== RouteKind.LEGACY)) capabilitySet.add('MANAGER');
    return {
      accountId: account.id,
      sessionId: session.id,
      accountKind: account.accountKind,
      accountStatus: account.status,
      username: account.username,
      employeeId: account.employeeId,
      passwordRestricted: session.passwordRestricted,
      structuralPosition: membership?.structuralPosition ?? null,
      organizationSnapshotId: membership?.snapshotId ?? null,
      organizationUnitId: membership?.organizationUnitId ?? null,
      directorate: membership?.organizationUnit.directorate ?? null,
      division: membership?.organizationUnit.division ?? null,
      department: membership?.organizationUnit.department ?? null,
      section: membership?.section ?? null,
      line: membership?.lineName ?? null,
      actingFor:
        account.accountKind === AccountKind.WORKFORCE
          ? await delegatorsFor(this.prisma, account.id)
          : [],
      unionSlot: unionTerm?.slot ?? null,
      capabilities: [...capabilitySet],
      routeUnitIds: routes
        .filter((route) => route.kind !== RouteKind.LEGACY)
        .map((route) => route.organizationUnitId)
        .filter((value): value is string => Boolean(value)),
      isGlobalPic: routes.some((route) => route.kind === RouteKind.GLOBAL_SPECIAL),
    };
  }

  require(actor: Principal, ...required: Capability[]) {
    if (!required.some((capability) => actor.capabilities.includes(capability)))
      throw forbiddenAsNotFound();
  }

  actorSnapshot(actor: Principal) {
    return {
      actorAccountKind: actor.accountKind,
      actorStructuralPosition: actor.structuralPosition,
      actorCapabilities: actor.capabilities,
    };
  }

  senderSnapshot(actor: Principal) {
    return {
      senderAccountKind: actor.accountKind,
      senderStructuralPosition: actor.structuralPosition,
      senderCapabilities: actor.capabilities,
    };
  }

  /**
   * Private Voices are handled by the Komite alone. The Director and every
   * Deputy/Division Head of the reporter's directorate read them, and their
   * chat, without acting.
   */
  privateObserverScope(actor: Principal): Prisma.VoiceWhereInput | null {
    if (
      !actor.directorate ||
      !actor.capabilities.some((c) => c === 'DIRECTOR' || c === 'DIVISION_LEADERSHIP')
    )
      return null;
    return { visibility: VoiceVisibility.PRIVATE, reporterDirectorateSnapshot: actor.directorate };
  }

  async browseScope(actor: Principal): Promise<Prisma.VoiceWhereInput> {
    if (actor.capabilities.includes('CARE_ADMIN')) return {};
    const own: Prisma.VoiceWhereInput = { reporterId: actor.accountId };
    const observed = this.privateObserverScope(actor);
    // Director reads every General Voice and their directorate's Private, read-only.
    if (actor.capabilities.includes('DIRECTOR'))
      return {
        OR: [own, { visibility: VoiceVisibility.GENERAL }, ...(observed ? [observed] : [])],
      };
    if (actor.capabilities.includes('UNION_HEAD') || actor.capabilities.includes('UNION_OFFICER'))
      return { visibility: VoiceVisibility.GENERAL };
    if (actor.capabilities.includes('DIVISION_LEADERSHIP') && actor.directorate && actor.division)
      return {
        OR: [
          own,
          {
            visibility: VoiceVisibility.GENERAL,
            reporterDirectorateSnapshot: actor.directorate,
            reporterDivisionSnapshot: actor.division,
          },
          ...(observed ? [observed] : []),
        ],
      };
    if (actor.capabilities.includes('MANAGER') && actor.organizationUnitId)
      return {
        OR: [
          own,
          {
            visibility: VoiceVisibility.GENERAL,
            reporterOrganizationUnitId: actor.organizationUnitId,
          },
        ],
      };
    // Voice Tim Saya: a Section Head reads their Section, a Group Leader their Line.
    const sectionHead = actor.capabilities.includes('SECTION_HEAD');
    const groupLeader = actor.capabilities.includes('GROUP_LEADER');
    if ((sectionHead || (groupLeader && actor.line)) && actor.organizationUnitId && actor.section)
      return {
        OR: [
          own,
          {
            visibility: VoiceVisibility.GENERAL,
            reporterOrganizationUnitId: actor.organizationUnitId,
            reporterSectionSnapshot: actor.section,
            ...(sectionHead ? {} : { reporterLineSnapshot: actor.line }),
          },
        ],
      };
    return own;
  }

  workItemScope(actor: Principal): Prisma.VoiceWhereInput {
    const scopes: Prisma.VoiceWhereInput[] = [];
    // A substitute's work list includes what the away leader holds.
    const ids = [actor.accountId, ...(actor.actingFor ?? [])];
    const mine = ids.length === 1 ? actor.accountId : { in: ids };
    const held = ids.length === 1 ? { has: actor.accountId } : { hasSome: ids };
    // A tiered Voice reaches the route Manager only once they hold it.
    if (actor.capabilities.includes('MANAGER'))
      scopes.push({
        visibility: VoiceVisibility.GENERAL,
        routeOwnerId: mine,
        tierLevel: null,
      });
    // Tiered Voices can be assigned to Group Leaders, Section Heads and Managers.
    if (actor.capabilities.some((c) => ['SECTION_HEAD', 'GROUP_LEADER', 'MANAGER'].includes(c)))
      scopes.push({ visibility: VoiceVisibility.GENERAL, currentHandlerId: mine });
    if (
      actor.capabilities.some((c) =>
        ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER', 'DIVISION_LEADERSHIP'].includes(c),
      )
    )
      scopes.push({
        visibility: VoiceVisibility.GENERAL,
        tierHolderIds: held,
      });
    if (actor.capabilities.includes('UNION_HEAD'))
      scopes.push({ visibility: VoiceVisibility.PRIVATE });
    if (actor.capabilities.includes('UNION_OFFICER'))
      scopes.push({ visibility: VoiceVisibility.PRIVATE, currentHandlerId: actor.accountId });
    if (actor.accountStatus === AccountStatus.LEGACY_HANDLER)
      scopes.push({ legacyAccess: { some: { accountId: actor.accountId, effectiveTo: null } } });
    // `id: { in: [] }` is a valid Prisma "match nothing" filter; a literal `id:
    // '__none__'` would be coerced as a UUID and fail for actors with no work-item
    // scope (e.g. a plain Member reading their own voice detail/timeline/messages).
    return scopes.length ? { OR: scopes } : { id: { in: [] } };
  }

  /**
   * "Butuh Tindakan Saya": active General Voices waiting for this responder (or
   * the away leader they substitute for), at whatever level they hold it.
   * - Terbuka / Direspons: a tier holder, unless a PIC below was assigned and
   *   has not missed their window; the route Manager of a fixed category while
   *   nobody is assigned; the assigned PIC.
   * - Diproses: only the PIC, who must close it.
   */
  actionNeededScope(actor: Principal): Prisma.VoiceWhereInput {
    const ids = [actor.accountId, ...(actor.actingFor ?? [])];
    const caps = actor.capabilities;
    if (
      !caps.some((c) =>
        ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER', 'DIVISION_LEADERSHIP'].includes(c),
      )
    )
      return { id: { in: [] } };
    const waiting = { in: [VoiceStatus.OPEN, VoiceStatus.RESPONDED] };
    return {
      visibility: VoiceVisibility.GENERAL,
      NOT: { reporterId: actor.accountId },
      OR: [
        {
          status: { in: [VoiceStatus.OPEN, VoiceStatus.RESPONDED, VoiceStatus.IN_PROGRESS] },
          currentHandlerId: { in: ids },
        },
        {
          status: waiting,
          tierHolderIds: { hasSome: ids },
          // An assigned PIC owns the next step until the Voice escalates past them.
          OR: [{ currentHandlerId: null }, { tierLowerHolderIds: { isEmpty: false } }],
        },
        ...(caps.includes('MANAGER')
          ? [
              {
                status: waiting,
                tierLevel: null,
                routeOwnerId: { in: ids },
                currentHandlerId: null,
              },
            ]
          : []),
      ],
    };
  }

  /** "Selesai oleh saya": General Voices whose current closure this responder made. */
  closedByScope(actor: Principal): Prisma.VoiceWhereInput {
    return {
      visibility: VoiceVisibility.GENERAL,
      status: VoiceStatus.CLOSED,
      // Only the latest cycle is never reopened.
      closureCycles: { some: { actorId: actor.accountId, reopenedAt: null } },
    };
  }

  async detailScope(actor: Principal): Promise<Prisma.VoiceWhereInput> {
    const browse = await this.browseScope(actor);
    // A match-all browse scope (CARE Admin) already covers every clause below.
    if (!Object.keys(browse).length) return browse;
    const work = this.workItemScope(actor);
    // `workItemScope` yields `{ id: { in: [] } }` when the actor has no work-item
    // scope. OR-ing a never-true clause is a no-op (and when `browse` is the whole
    // universe `{}`, wrapping it in an OR would swallow the match-all clause), so
    // drop the empty work-item clause entirely.
    const isEmptyWork =
      typeof work === 'object' &&
      work !== null &&
      'id' in work &&
      Array.isArray((work as { id: { in?: unknown[] } }).id?.in) &&
      (work as { id: { in?: unknown[] } }).id.in?.length === 0;
    // Former tier holders keep reading a Voice that moved up without them.
    const observed: Prisma.VoiceWhereInput = {
      visibility: VoiceVisibility.GENERAL,
      OR: [
        { tierObserverIds: { has: actor.accountId } },
        { tierParticipantIds: { has: actor.accountId } },
      ],
    };
    // A Manager who handed a General Voice over keeps read-only access to it.
    const handedOver: Prisma.VoiceWhereInput[] = actor.capabilities.includes('MANAGER')
      ? [
          {
            visibility: VoiceVisibility.GENERAL,
            handovers: { some: { fromPicId: actor.accountId } },
          },
        ]
      : [];
    const clauses = [...(isEmptyWork ? [] : [work]), ...handedOver, observed];
    return clauses.length ? { OR: [browse, ...clauses] } : browse;
  }
}
