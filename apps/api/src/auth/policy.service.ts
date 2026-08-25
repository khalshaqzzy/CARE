import { Inject, Injectable } from '@nestjs/common';
import {
  AccountKind,
  AccountStatus,
  Prisma,
  RouteKind,
  UnionSlot,
  VoiceVisibility,
} from '@prisma/client';
import { forbiddenAsNotFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { type Capability, divisionLeadershipPositions, normalizedPosition } from './capabilities';

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
      unionSlot: unionTerm?.slot ?? null,
      capabilities: [...capabilitySet],
      routeUnitIds: routes
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

  async browseScope(actor: Principal): Promise<Prisma.VoiceWhereInput> {
    if (actor.capabilities.includes('CARE_ADMIN')) return {};
    const own: Prisma.VoiceWhereInput = { reporterId: actor.accountId };
    if (actor.capabilities.includes('DIRECTOR'))
      return { OR: [own, { visibility: VoiceVisibility.GENERAL }] };
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
    return own;
  }

  workItemScope(actor: Principal): Prisma.VoiceWhereInput {
    const scopes: Prisma.VoiceWhereInput[] = [];
    if (actor.capabilities.includes('MANAGER'))
      scopes.push({ visibility: VoiceVisibility.GENERAL, routeOwnerId: actor.accountId });
    if (actor.capabilities.includes('SECTION_HEAD'))
      scopes.push({ visibility: VoiceVisibility.GENERAL, currentHandlerId: actor.accountId });
    if (actor.capabilities.includes('UNION_HEAD'))
      scopes.push({ visibility: VoiceVisibility.PRIVATE });
    if (actor.capabilities.includes('UNION_OFFICER'))
      scopes.push({ visibility: VoiceVisibility.PRIVATE, currentHandlerId: actor.accountId });
    if (actor.accountStatus === AccountStatus.LEGACY_HANDLER)
      scopes.push({ legacyAccess: { some: { accountId: actor.accountId, effectiveTo: null } } });
    return scopes.length ? { OR: scopes } : { id: '__none__' };
  }

  async detailScope(actor: Principal): Promise<Prisma.VoiceWhereInput> {
    const browse = await this.browseScope(actor);
    return { OR: [browse, this.workItemScope(actor)] };
  }
}
