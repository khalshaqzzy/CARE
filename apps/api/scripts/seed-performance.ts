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
            currentHandlerId: ['IN_PROGRESS', 'CLOSED'].includes(Object.values(VoiceStatus)[n % 4]!)
              ? managerId
              : null,
            handlingOrganizationUnitId: units[n % units.length]!.id,
            handlingDirectorateSnapshot: units[n % units.length]!.directorate,
            handlingDivisionSnapshot: units[n % units.length]!.division,
            handlingDepartmentSnapshot: units[n % units.length]!.department,
            handlingSectionSnapshot: 'Section A',
            handlingOrganizationSource: 'ROUTE',
            routeMappingId: route.id,
            handlerType: 'MANAGER' as const,
            anonymousAlias: `Synthetic-${n}`,
          };
        }),
        skipDuplicates: true,
      });
    await prisma.$executeRaw`INSERT INTO "VoiceEvent" (id, "voiceId", type, "actorId", "actorAccountKind", "actorCapabilities", payload, "occurredAt")
      SELECT gen_random_uuid(), v.id, 'MONITORED', v."routeOwnerId", 'WORKFORCE', '["MANAGER"]'::jsonb, '{}'::jsonb, v."submittedAt" + interval '2 hours'
      FROM "Voice" v WHERE v."displayId" LIKE 'CARE-209901-%' AND v.status <> 'OPEN'
        AND NOT EXISTS (SELECT 1 FROM "VoiceEvent" e WHERE e."voiceId" = v.id AND e.type = 'MONITORED')`;
    await prisma.$executeRaw`INSERT INTO "ClosureCycle" (id, "voiceId", "cycleNumber", "actorId", note, "closedAt", "reopenedAt", "reviewState")
      SELECT gen_random_uuid(), v.id, n, v."routeOwnerId", 'Synthetic cycle', v."submittedAt" + n * interval '10 hours',
        CASE WHEN n = 1 THEN v."submittedAt" + interval '12 hours' END, 'ACCEPTED'::"ClosureReviewState"
      FROM "Voice" v CROSS JOIN generate_series(1, 2) n WHERE v."displayId" LIKE 'CARE-209901-%' AND v.status = 'CLOSED'
      ON CONFLICT ("voiceId", "cycleNumber") DO NOTHING`;
    await prisma.$executeRaw`INSERT INTO "Rating" (id, "closureCycleId", "reporterId", score, reopen, "createdAt")
      SELECT gen_random_uuid(), c.id, v."reporterId", CASE WHEN c."cycleNumber" = 1 THEN 2 ELSE 5 END, c."cycleNumber" = 1, c."closedAt" + interval '1 hour'
      FROM "ClosureCycle" c JOIN "Voice" v ON v.id = c."voiceId" WHERE v."displayId" LIKE 'CARE-209901-%'
      ON CONFLICT ("closureCycleId") DO NOTHING`;
    await prisma.$executeRaw`INSERT INTO "Conversation" ("id", "voiceId", "createdAt")
      SELECT gen_random_uuid(), "id", "updatedAt" FROM "Voice"
      WHERE "status" IN ('IN_PROGRESS', 'CLOSED') ON CONFLICT ("voiceId") DO NOTHING`;
    // A fresh CI database has no distribution statistics immediately after this
    // bulk load. Do not race the asynchronous autoanalyze worker during timing.
    // This collects planner statistics; it does not run or cache dashboard queries.
    await prisma.$executeRaw`ANALYZE "Voice", "VoiceEvent", "ClosureCycle", "Rating"`;
    process.stdout.write(
      `Performance fixture contains ${voiceCount} requested Voices and ${accountCount} accounts\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main();
