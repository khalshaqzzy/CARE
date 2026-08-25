import { AccountKind, PrismaClient, RouteKind, UnionSlot } from '@prisma/client';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();
describe('PostgreSQL v1.1 business invariants', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit" CASCADE',
    );
  });
  afterAll(async () => prisma.$disconnect());

  it('allows exactly one active account per Union slot', async () => {
    const passwordHash = await hash('temporary-password');
    const first = await prisma.userAccount.create({
      data: {
        username: 'union-a',
        displayName: 'Union A',
        accountKind: AccountKind.UNION,
        passwordHash,
      },
    });
    const second = await prisma.userAccount.create({
      data: {
        username: 'union-b',
        displayName: 'Union B',
        accountKind: AccountKind.UNION,
        passwordHash,
      },
    });
    await prisma.unionAccountTerm.create({ data: { accountId: first.id, slot: UnionSlot.HEAD } });
    await expect(
      prisma.unionAccountTerm.create({ data: { accountId: second.id, slot: UnionSlot.HEAD } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.unionAccountTerm.create({ data: { accountId: second.id, slot: UnionSlot.OFFICER_1 } }),
    ).resolves.toMatchObject({ slot: UnionSlot.OFFICER_1 });
  });

  it('enforces one active global PIC while permitting composite department routes', async () => {
    const passwordHash = await hash('temporary-password');
    const employees = await Promise.all(
      ['M001', 'M002'].map((noReg) => prisma.employee.create({ data: { noReg, name: noReg } })),
    );
    const accounts = await Promise.all(
      employees.map((employee) =>
        prisma.userAccount.create({
          data: {
            employeeId: employee.id,
            username: employee.noReg.toLocaleLowerCase('en-US'),
            displayName: employee.name,
            accountKind: AccountKind.WORKFORCE,
            passwordHash,
          },
        }),
      ),
    );
    await prisma.routeMapping.create({
      data: { kind: RouteKind.GLOBAL_SPECIAL, ownerAccountId: accounts[0]!.id },
    });
    await expect(
      prisma.routeMapping.create({
        data: { kind: RouteKind.GLOBAL_SPECIAL, ownerAccountId: accounts[1]!.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const units = await Promise.all([
      prisma.organizationUnit.create({
        data: { directorate: 'Manufacturing', division: 'A', department: 'Maintenance Dept' },
      }),
      prisma.organizationUnit.create({
        data: { directorate: 'Manufacturing', division: 'B', department: 'Maintenance Dept' },
      }),
    ]);
    await expect(
      Promise.all(
        units.map((unit, index) =>
          prisma.routeMapping.create({
            data: {
              kind: RouteKind.DEPARTMENT_HEAD,
              organizationUnitId: unit.id,
              ownerAccountId: accounts[index]!.id,
            },
          }),
        ),
      ),
    ).resolves.toHaveLength(2);
  });
});
