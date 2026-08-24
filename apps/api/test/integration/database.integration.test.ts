import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Area, PrismaClient, Role } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();
describe('PostgreSQL business invariants', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UserAccount", "Employee" CASCADE');
  });
  afterAll(async () => prisma.$disconnect());
  it('enforces one active Union account', async () => {
    const passwordHash = await hash('temporary-password');
    await prisma.userAccount.create({
      data: { username: 'union-a', displayName: 'Union A', role: Role.UNION, passwordHash },
    });
    await expect(
      prisma.userAccount.create({
        data: { username: 'union-b', displayName: 'Union B', role: Role.UNION, passwordHash },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  it('enforces active Manager route uniqueness in PostgreSQL', async () => {
    const passwordHash = await hash('temporary-password');
    for (const noReg of ['M001', 'M002']) {
      const employee = await prisma.employee.create({
        data: { noReg, name: noReg, division: 'Production', department: noReg },
      });
      const account = await prisma.userAccount.create({
        data: {
          employeeId: employee.id,
          username: noReg,
          displayName: noReg,
          role: Role.MANAGER,
          passwordHash,
        },
      });
      await prisma.managerProfile
        .create({
          data: {
            employeeId: employee.id,
            accountId: account.id,
            area: Area.KARAWANG_1,
            department: noReg,
            isSafety: true,
          },
        })
        .catch((error) => {
          if (noReg === 'M002') expect(error).toMatchObject({ code: 'P2002' });
          else throw error;
        });
    }
    expect(
      await prisma.managerProfile.count({
        where: { active: true, isSafety: true, area: Area.KARAWANG_1 },
      }),
    ).toBe(1);
    const employee = await prisma.employee.create({
      data: {
        noReg: 'M003',
        name: 'M003',
        division: 'Production',
        department: 'M001',
      },
    });
    const account = await prisma.userAccount.create({
      data: {
        employeeId: employee.id,
        username: 'M003',
        displayName: 'M003',
        role: Role.MANAGER,
        passwordHash,
      },
    });
    await expect(
      prisma.managerProfile.create({
        data: {
          employeeId: employee.id,
          accountId: account.id,
          area: Area.KARAWANG_2,
          department: 'M001',
          isSafety: false,
          isFacility: false,
        },
      }),
    ).resolves.toMatchObject({ department: 'M001' });
  });
});
