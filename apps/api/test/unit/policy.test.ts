import { AccountKind, AccountStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';

const principal = (
  capabilities: Principal['capabilities'],
  overrides: Partial<Principal> = {},
): Principal => ({
  accountId: 'account',
  sessionId: 'session',
  accountKind: AccountKind.WORKFORCE,
  accountStatus: AccountStatus.ACTIVE,
  username: 'account',
  employeeId: 'employee',
  passwordRestricted: false,
  structuralPosition: 'Member',
  organizationSnapshotId: 'snapshot',
  organizationUnitId: 'unit',
  directorate: 'Directorate',
  division: 'Division A',
  department: 'Department A',
  section: 'Section A',
  unionSlot: null,
  capabilities,
  routeUnitIds: [],
  isGlobalPic: false,
  ...overrides,
});

describe('Authorization scopes', () => {
  const policy = new PolicyService({} as never);
  it('separates Manager department browse from route work-items and division aggregate metadata', async () => {
    const manager = principal(['MEMBER', 'MANAGER'], {
      routeUnitIds: ['unit-b'],
      isGlobalPic: true,
    });
    expect(await policy.browseScope(manager)).toEqual({
      OR: [
        { reporterId: 'account' },
        { visibility: 'GENERAL', reporterOrganizationUnitId: 'unit' },
      ],
    });
    expect(policy.workItemScope(manager)).toEqual({
      OR: [{ visibility: 'GENERAL', routeOwnerId: 'account' }],
    });
  });
  it('grants leadership/Director/Union read scopes without route-action work items', async () => {
    const leadership = principal(['MEMBER', 'DIVISION_LEADERSHIP']);
    expect(await policy.browseScope(leadership)).toEqual({
      OR: [
        { reporterId: 'account' },
        {
          visibility: 'GENERAL',
          reporterDirectorateSnapshot: 'Directorate',
          reporterDivisionSnapshot: 'Division A',
        },
      ],
    });
    expect(policy.workItemScope(leadership)).toEqual({ id: { in: [] } });
    expect(await policy.browseScope(principal(['MEMBER', 'DIRECTOR']))).toEqual({
      OR: [{ reporterId: 'account' }, { visibility: 'GENERAL' }],
    });
    const union = principal(['UNION_HEAD'], { accountKind: AccountKind.UNION, employeeId: null });
    expect(await policy.browseScope(union)).toEqual({ visibility: 'GENERAL' });
    expect(policy.workItemScope(union)).toEqual({ OR: [{ visibility: 'PRIVATE' }] });
  });
  it('keeps Section Head operational access assignment-specific and Admin detail unrestricted', async () => {
    const sectionHead = principal(['MEMBER', 'SECTION_HEAD']);
    expect(policy.workItemScope(sectionHead)).toEqual({
      OR: [{ visibility: 'GENERAL', currentHandlerId: 'account' }],
    });
    expect(
      await policy.browseScope(
        principal(['CARE_ADMIN'], { accountKind: AccountKind.CARE_ADMIN, employeeId: null }),
      ),
    ).toEqual({});
  });
});
