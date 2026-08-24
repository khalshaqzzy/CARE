import { Area, PrismaClient, Role, Severity, VoiceStatus, VoiceVisibility } from '@prisma/client';
import { hash } from 'argon2';
import { createHash } from 'node:crypto';

function stableUuid(namespace: string, value: number) {
  const hex = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function main() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Performance fixture seeding is test-only');
  const prisma = new PrismaClient();
  const count = Number(process.env.PERF_VOICE_COUNT ?? 50_000);
  const passwordHash = await hash('performance-temporary');
  try {
    const memberEmployees = Array.from({ length: 1_999 }, (_, index) => ({
      id: stableUuid('employee', index),
      noReg: `PERF_MEMBER_${String(index).padStart(4, '0')}`,
      name: `Performance Member ${index}`,
      division: 'Test',
      department: `Performance-${index % 20}`,
    }));
    await prisma.employee.createMany({ data: memberEmployees, skipDuplicates: true });
    const memberAccounts = memberEmployees.map((employee, index) => ({
      id: stableUuid('account', index),
      employeeId: employee.id,
      username: employee.noReg,
      displayName: employee.name,
      role: Role.MEMBER,
      passwordHash,
    }));
    await prisma.userAccount.createMany({ data: memberAccounts, skipDuplicates: true });
    const managerEmployee = await prisma.employee.upsert({
      where: { noReg: 'PERF_MANAGER' },
      update: {},
      create: {
        noReg: 'PERF_MANAGER',
        name: 'Performance Manager',
        division: 'Test',
        department: 'Performance',
      },
    });
    const manager = await prisma.userAccount.upsert({
      where: { username: 'PERF_MANAGER' },
      update: {},
      create: {
        employeeId: managerEmployee.id,
        username: 'PERF_MANAGER',
        displayName: 'Performance Manager',
        role: Role.MANAGER,
        passwordHash,
      },
    });
    for (let offset = 0; offset < count; offset += 1000) {
      const size = Math.min(1000, count - offset);
      await prisma.voice.createMany({
        data: Array.from({ length: size }, (_, index) => {
          const n = offset + index + 1;
          return {
            displayId: `CARE-209901-${String(n).padStart(6, '0')}`,
            reporterId: memberAccounts[n % memberAccounts.length]!.id,
            visibility: VoiceVisibility.GENERAL,
            area: Area.KARAWANG_1,
            reporterDepartment: 'Performance',
            locationDetail: 'Synthetic station',
            title: `Synthetic Voice ${n}`,
            detail: 'Non-sensitive deterministic performance fixture',
            severity: Object.values(Severity)[n % 4]!,
            status: Object.values(VoiceStatus)[n % 4]!,
            routeOwnerId: manager.id,
            handlerType: 'MANAGER',
            anonymousAlias: `Synthetic-${n}`,
          };
        }),
        skipDuplicates: true,
      });
    }
    process.stdout.write(
      `Performance fixture contains ${count} requested Voices and 2000 accounts\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main();
