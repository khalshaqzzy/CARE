import {
  AccountKind,
  Area,
  PrismaClient,
  Severity,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { hash } from 'argon2';
import { createHash } from 'node:crypto';

function stableUuid(namespace: string, value: number) {
  const hex = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
async function main() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Performance fixture seeding is test-only');
  const prisma = new PrismaClient();
  const accountCount = 10_000;
  const voiceCount = Number(process.env.PERF_VOICE_COUNT ?? 50_000);
  const passwordHash = await hash('performance-temporary');
  try {
    await prisma.organizationSnapshot.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'SUPERSEDED', supersededAt: new Date() },
    });
    await prisma.routeMapping.updateMany({
      where: { kind: 'GLOBAL_SPECIAL', effectiveTo: null },
      data: { effectiveTo: new Date() },
    });
    const snapshot = await prisma.organizationSnapshot.create({
      data: {
        checksum: createHash('sha256').update(String(Date.now())).digest('hex'),
        status: 'ACTIVE',
        rowCount: accountCount,
      },
    });
    const units = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        prisma.organizationUnit.upsert({
          where: {
            directorate_division_department: {
              directorate: 'Synthetic',
              division: `Division ${index % 4}`,
              department: `Department ${index}`,
            },
          },
          update: {},
          create: {
            directorate: 'Synthetic',
            division: `Division ${index % 4}`,
            department: `Department ${index}`,
          },
        }),
      ),
    );
    for (let offset = 0; offset < accountCount; offset += 1000) {
      const employees = Array.from(
        { length: Math.min(1000, accountCount - offset) },
        (_, index) => {
          const n = offset + index;
          return {
            id: stableUuid('employee', n),
            noReg: `PERF_${String(n).padStart(5, '0')}`,
            name: `Performance Employee ${n}`,
          };
        },
      );
      await prisma.employee.createMany({ data: employees, skipDuplicates: true });
      await prisma.userAccount.createMany({
        data: employees.map((employee, index) => {
          const n = offset + index;
          return {
            id: stableUuid('account', n),
            employeeId: employee.id,
            username: employee.noReg.toLocaleLowerCase('en-US'),
            displayName: employee.name,
            accountKind: AccountKind.WORKFORCE,
            passwordHash,
          };
        }),
        skipDuplicates: true,
      });
      await prisma.organizationMembership.createMany({
        data: employees.map((employee, index) => {
          const n = offset + index;
          return {
            snapshotId: snapshot.id,
            employeeId: employee.id,
            organizationUnitId: units[n % units.length]!.id,
            employeeName: employee.name,
            structuralPosition:
              n === 0 ? 'Department Head' : n % 40 === 0 ? 'Section Head' : 'Member',
            section: `Section ${n % 10}`,
            sourceRow: n + 2,
          };
        }),
        skipDuplicates: true,
      });
    }
    const managerId = stableUuid('account', 0);
    const route = await prisma.routeMapping.create({
      data: {
        kind: 'GLOBAL_SPECIAL',
        ownerAccountId: managerId,
        reason: 'Synthetic performance route',
      },
    });
    for (let offset = 0; offset < voiceCount; offset += 1000)
      await prisma.voice.createMany({
        data: Array.from({ length: Math.min(1000, voiceCount - offset) }, (_, index) => {
          const n = offset + index + 1;
          return {
            displayId: `CARE-209901-${String(n).padStart(6, '0')}`,
            reporterId: stableUuid('account', n % accountCount),
            visibility: VoiceVisibility.GENERAL,
            area: Area.KARAWANG_1,
            reporterNoRegSnapshot: `PERF_${String(n % accountCount).padStart(5, '0')}`,
            reporterNameSnapshot: `Performance Employee ${n % accountCount}`,
            reporterDirectorateSnapshot: 'Synthetic',
            reporterDivisionSnapshot: `Division ${n % 4}`,
            reporterDepartmentSnapshot: `Department ${n % 20}`,
            locationDetail: 'Synthetic station',
            title: `Synthetic Voice ${n}`,
            detail: 'Non-sensitive deterministic performance fixture',
            categoryKey: 'WORK_DIFFICULTY',
            severity: Object.values(Severity)[n % 4]!,
            status: Object.values(VoiceStatus)[n % 4]!,
            routeOwnerId: managerId,
            routeMappingId: route.id,
            handlerType: 'MANAGER' as const,
            anonymousAlias: `Synthetic-${n}`,
          };
        }),
        skipDuplicates: true,
      });
    process.stdout.write(
      `Performance fixture contains ${voiceCount} requested Voices and ${accountCount} accounts\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main();
