import { AccountKind, PrismaClient, RoutingCategory, Severity } from '@prisma/client';
import { hash } from 'argon2';
import ExcelJS from 'exceljs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminService } from '../../src/admin/admin.service';
import { PolicyService } from '../../src/auth/policy.service';
import type { AuthActor } from '../../src/auth/auth.types';
import { ImportsService, ORGANIZATION_HEADERS } from '../../src/imports/imports.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const imports = new ImportsService(prisma as never);
const adminService = new AdminService(prisma as never, policy);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);
let admin: AuthActor;

async function xlsx(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('MFG + QD');
  sheet.addRow([...ORGANIZATION_HEADERS]);
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
async function actor(username: string) {
  const account = await prisma.userAccount.findUniqueOrThrow({ where: { username } });
  return policy.resolvePrincipal(account, { id: crypto.randomUUID(), passwordRestricted: false });
}

function organizationRows(count: number) {
  const headedUnits = new Set<number>();
  return Array.from({ length: count }, (_, index) => {
    const unit = index < 188 ? 0 : 1 + ((index - 188) % 57);
    const department = unit === 0 ? '14' : `Department ${unit}`;
    const isHead = unit >= 13 && !headedUnits.has(unit);
    if (isHead) headedUnits.add(unit);
    return [
      String(100_000 + index),
      `Synthetic Employee ${index + 1}`,
      isHead ? 'Department Head' : 'Member',
      'Manufacturing',
      `Division ${Math.floor(unit / 10) + 1}`,
      department,
      `Section ${(index % 20) + 1}`,
    ];
  });
}

async function waitForImport(id: string, timeoutMs = 240_000) {
  const startedAt = Date.now();
  let batch = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
  while (['QUEUED', 'PROCESSING'].includes(batch.status) && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    batch = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
  }
  return batch;
}

describe('Organization, remediation, and routing journey', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit" CASCADE',
    );
    const account = await prisma.userAccount.create({
      data: {
        username: 'organization-routing-admin',
        displayName: 'Organization Routing Admin',
        passwordHash: await hash('organization-routing-test-password'),
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
    admin = await policy.resolvePrincipal(account, {
      id: crypto.randomUUID(),
      passwordRestricted: false,
    });
  });
  afterAll(async () => prisma.$disconnect());

  it('confirms an authoritative snapshot asynchronously and materializes routes/issues', async () => {
    const buffer = await xlsx([
      [
        '000001',
        'Department Head',
        'Department Head',
        'Manufacturing',
        'Division A',
        'Department A',
        'Management',
      ],
      [
        '000002',
        'Section Head',
        'Section Head',
        'Manufacturing',
        'Division A',
        'Department A',
        'Section A',
      ],
      ['000003', 'Member', 'Member', 'Manufacturing', 'Division A', 'Department A', 'Section A'],
      ['000014', 'Unrouted Member', 'Member', 'Manufacturing', 'Division A', '', ''],
    ]);
    const preview = await imports.preview(admin, {
      buffer,
      size: buffer.length,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as Express.Multer.File);
    expect(preview.summary).toMatchObject({ rowCount: 4, unitCount: 2, department14Rows: 1 });
    const rawStorageKey = (
      await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } })
    ).storageKey;
    await imports.confirm(
      admin,
      preview.id,
      {
        checksum: preview.checksum,
        expectedVersion: preview.version,
      },
      'organization-routing-xlsx-confirm',
    );
    let batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } });
    for (let attempt = 0; attempt < 100 && batch.status !== 'CONFIRMED'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } });
    }
    expect(batch.status).toBe('CONFIRMED');
    await expect(access(resolve(process.env.MEDIA_ROOT!, rawStorageKey))).rejects.toThrow();
    expect(await prisma.organizationMembership.count()).toBe(4);
    expect(
      await prisma.routeMapping.count({ where: { kind: 'DEPARTMENT_HEAD', effectiveTo: null } }),
    ).toBe(1);
    expect(
      await prisma.importIssue.count({ where: { type: 'DEPARTMENT_14', status: 'OPEN' } }),
    ).toBe(1);
    expect(
      await prisma.importIssue.count({ where: { type: 'INVALID_GLOBAL_PIC', status: 'OPEN' } }),
    ).toBe(1);
  });

  it('re-parses and confirms a checksum-bound CSV snapshot asynchronously', async () => {
    const rows = [
      [
        '000001',
        'Department Head',
        'Department Head',
        'Manufacturing',
        'Division A',
        'Department A',
        'Management',
      ],
      [
        '000002',
        'Section Head',
        'Section Head',
        'Manufacturing',
        'Division A',
        'Department A',
        'Section A',
      ],
      ['000003', 'Member', 'Member', 'Manufacturing', 'Division A', 'Department A', 'Section A'],
      ['000014', 'Unrouted Member', 'Member', 'Manufacturing', 'Division A', '', ''],
    ];
    const buffer = Buffer.from(
      `${ORGANIZATION_HEADERS.join(',')}\n${rows.map((row) => row.join(',')).join('\n')}\n`,
      'utf8',
    );
    const preview = await imports.preview(admin, {
      buffer,
      size: buffer.length,
      originalname: 'organization.csv',
      mimetype: 'text/csv',
    } as Express.Multer.File);
    expect(
      (await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } })).storageKey,
    ).toMatch(/\.csv$/);
    await imports.confirm(
      admin,
      preview.id,
      {
        checksum: preview.checksum,
        expectedVersion: preview.version,
      },
      'organization-routing-csv-confirm',
    );
    let batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } });
    for (let attempt = 0; attempt < 100 && batch.status !== 'CONFIRMED'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } });
    }
    expect(batch.status).toBe('CONFIRMED');
    expect(
      await prisma.organizationMembership.count({ where: { snapshotId: batch.snapshotId! } }),
    ).toBe(4);
  });

  it('provisions one global PIC and three Union slots, then routes General and Private correctly', async () => {
    await adminService.setGlobalPic(admin, { noReg: '000001' }, 'organization-routing-global-pic');
    const departmentHead = await prisma.userAccount.findUniqueOrThrow({
      where: { username: '000001' },
    });
    for (const item of [
      { slot: 'HEAD', username: 'union-head' },
      { slot: 'OFFICER_1', username: 'union-1' },
      { slot: 'OFFICER_2', username: 'union-2' },
    ])
      await adminService.setUnionAccount(
        admin,
        item.slot,
        {
          username: item.username,
          displayName: item.username,
          expectedCurrentTerm: null,
          reason: `Integration test ${item.slot}`,
        },
        `organization-routing-union-${item.slot}`,
      );
    const member = await actor('000003');

    const generalDraft = await voices.createDraft(member, {
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      locationDetail: 'Line A station 4',
      title: 'Environmental leak',
      detail: 'Liquid waste is leaking near the process',
    });
    await voices.manualClassification(member, generalDraft.id, {
      category: RoutingCategory.ENVIRONMENT,
      severity: Severity.HIGH,
    });
    const locationReview = await prisma.locationReviewSnapshot.create({
      data: {
        draftId: generalDraft.id,
        promptVersion: 'care-location-v1.2',
        completeness: 'INCOMPLETE',
        warning: 'Lokasi belum rinci',
        questions: ['Di station mana?'],
        contentHash: generalDraft.locationContentHash,
      },
    });
    await expect(
      voices.submit(
        member,
        generalDraft.id,
        { version: generalDraft.version },
        'organization-routing-general',
      ),
    ).rejects.toMatchObject({
      code: 'LOCATION_ACKNOWLEDGMENT_REQUIRED',
      message:
        'Detail lokasi Anda belum lengkap, dan Voice berpotensi tidak ditangani dengan baik.',
    });
    const general = await voices.submit(
      member,
      generalDraft.id,
      {
        version: generalDraft.version,
        locationReviewId: locationReview.id,
        locationContentHash: generalDraft.locationContentHash,
        acknowledgeIncompleteLocation: true,
      },
      'organization-routing-general',
    );
    const generalVoice = await prisma.voice.findUniqueOrThrow({
      where: { id: (general as { id: string }).id },
    });
    expect(generalVoice).toMatchObject({
      category: RoutingCategory.ENVIRONMENT,
      routeOwnerId: departmentHead.id,
    });

    const privateDraft = await voices.createDraft(member, {
      visibility: 'PRIVATE',
      showReporterIdentity: false,
      area: 'KARAWANG_1',
      locationDetail: 'Line A station 4',
      title: 'Private concern',
      detail: 'A private workplace concern',
    });
    await voices.manualClassification(member, privateDraft.id, {
      category: null,
      severity: Severity.MEDIUM,
    });
    const privateResult = await voices.submit(
      member,
      privateDraft.id,
      { version: privateDraft.version },
      'organization-routing-private',
    );
    const privateVoice = await prisma.voice.findUniqueOrThrow({
      where: { id: (privateResult as { id: string }).id },
    });
    const head = await prisma.userAccount.findUniqueOrThrow({ where: { username: 'union-head' } });
    expect(privateVoice).toMatchObject({
      category: null,
      showReporterIdentity: false,
      routeOwnerId: head.id,
    });

    const department14 = await actor('000014');
    const blockedDraft = await voices.createDraft(department14, {
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      locationDetail: 'Unknown',
      title: 'General from 14',
      detail: 'This draft must remain after route rejection',
    });
    await voices.manualClassification(department14, blockedDraft.id, {
      category: RoutingCategory.WORK_DIFFICULTY,
      severity: Severity.LOW,
    });
    await expect(
      voices.submit(
        department14,
        blockedDraft.id,
        { version: blockedDraft.version },
        'organization-routing-department-14',
      ),
    ).rejects.toMatchObject({ code: 'GENERAL_ROUTE_FORBIDDEN' });
    expect(await prisma.voiceDraft.findUnique({ where: { id: blockedDraft.id } })).not.toBeNull();
  });

  it('resolves a missing department route from No. Reg without an account ID', async () => {
    const unit = await prisma.organizationUnit.create({
      data: {
        directorate: 'Manufacturing',
        division: 'Division A',
        department: 'Department Without Head',
      },
    });
    const route = (await adminService.setDefaultPic(
      admin,
      unit.id,
      { noReg: '000003' },
      'organization-routing-default-pic-by-no-reg',
    )) as { organizationUnitId: string; ownerAccountId: string };
    const owner = await prisma.userAccount.findUniqueOrThrow({ where: { username: '000003' } });
    expect(route).toMatchObject({ organizationUnitId: unit.id, ownerAccountId: owner.id });
  });

  it('confirms the 7,018-row organization shape and a 10,000-account monthly profile within the transaction budget', async () => {
    const measuredPrisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    await measuredPrisma.$connect();
    let queryCount = 0;
    measuredPrisma.$on('query', () => {
      queryCount += 1;
    });
    const measuredImports = new ImportsService(measuredPrisma as never);
    try {
      const omittedMember = await prisma.userAccount.findUniqueOrThrow({
        where: { username: '000003' },
      });
      const omittedSession = await prisma.session.create({
        data: {
          accountId: omittedMember.id,
          tokenHash: 'a'.repeat(64),
          csrfSecret: 'b'.repeat(64),
          expiresAt: new Date(Date.now() + 3_600_000),
          absoluteExpiresAt: new Date(Date.now() + 7_200_000),
        },
      });
      const actualShape = organizationRows(7_018);
      const actualBuffer = await xlsx(actualShape);
      const firstPreview = await measuredImports.preview(admin, {
        buffer: actualBuffer,
        size: actualBuffer.length,
        originalname: 'synthetic-7018.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as Express.Multer.File);
      expect(firstPreview.summary).toMatchObject({
        rowCount: 7_018,
        unitCount: 58,
        department14Rows: 188,
      });
      queryCount = 0;
      await measuredImports.confirm(
        admin,
        firstPreview.id,
        { checksum: firstPreview.checksum, expectedVersion: firstPreview.version },
        'organization-routing-7018-confirm',
      );
      const firstBatch = await waitForImport(firstPreview.id);
      expect(firstBatch.status).toBe('CONFIRMED');
      expect(queryCount).toBeLessThan(500);
      expect(
        await prisma.organizationMembership.count({
          where: { snapshotId: firstBatch.snapshotId! },
        }),
      ).toBe(7_018);
      expect(
        await prisma.importIssue.count({
          where: { batchId: firstBatch.id, type: 'MISSING_DEPARTMENT_HEAD' },
        }),
      ).toBe(12);
      expect(
        await prisma.importIssue.count({
          where: { batchId: firstBatch.id, type: 'DEPARTMENT_14' },
        }),
      ).toBe(1);
      expect(
        await prisma.userAccount.findUniqueOrThrow({ where: { username: '000001' } }),
      ).toMatchObject({ status: 'LEGACY_HANDLER' });
      expect(
        await prisma.userAccount.findUniqueOrThrow({ where: { username: '000003' } }),
      ).toMatchObject({ status: 'INACTIVE' });
      expect(await prisma.session.findUniqueOrThrow({ where: { id: omittedSession.id } })).toEqual(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );

      const tenThousandRows = organizationRows(10_000);
      const csvBuffer = Buffer.from(
        `${ORGANIZATION_HEADERS.join(',')}\n${tenThousandRows.map((row) => row.join(',')).join('\n')}\n`,
      );
      const secondPreview = await measuredImports.preview(admin, {
        buffer: csvBuffer,
        size: csvBuffer.length,
        originalname: 'synthetic-10000.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File);
      queryCount = 0;
      await measuredImports.confirm(
        admin,
        secondPreview.id,
        { checksum: secondPreview.checksum, expectedVersion: secondPreview.version },
        'organization-routing-10000-confirm',
      );
      const secondBatch = await waitForImport(secondPreview.id);
      expect(secondBatch.status).toBe('CONFIRMED');
      expect(queryCount).toBeLessThan(500);
      expect(
        await prisma.organizationMembership.count({
          where: { snapshotId: secondBatch.snapshotId! },
        }),
      ).toBe(10_000);
      expect(
        await prisma.userAccount.count({
          where: { accountKind: AccountKind.WORKFORCE, status: 'ACTIVE' },
        }),
      ).toBe(10_000);

      await prisma.$executeRawUnsafe(`
          CREATE FUNCTION care_test_reject_membership() RETURNS trigger AS $$
          BEGIN
            RAISE EXCEPTION 'injected membership failure';
          END;
          $$ LANGUAGE plpgsql
        `);
      await prisma.$executeRawUnsafe(`
          CREATE TRIGGER care_test_reject_membership
          BEFORE INSERT ON "OrganizationMembership"
          FOR EACH STATEMENT EXECUTE FUNCTION care_test_reject_membership()
        `);
      try {
        const failureBuffer = Buffer.from(
          `${ORGANIZATION_HEADERS.join(',')}\n999999,Failure Probe,Member,D,V,Department F,Section F\n`,
        );
        const failurePreview = await measuredImports.preview(admin, {
          buffer: failureBuffer,
          size: failureBuffer.length,
          originalname: 'injected-failure.csv',
          mimetype: 'text/csv',
        } as Express.Multer.File);
        await measuredImports.confirm(
          admin,
          failurePreview.id,
          { checksum: failurePreview.checksum, expectedVersion: failurePreview.version },
          'organization-routing-rollback-confirm',
        );
        const failedBatch = await waitForImport(failurePreview.id);
        expect(failedBatch).toMatchObject({ status: 'FAILED', snapshotId: null });
        expect(await prisma.organizationSnapshot.count({ where: { status: 'ACTIVE' } })).toBe(1);
        expect(
          await prisma.organizationMembership.count({
            where: { snapshotId: secondBatch.snapshotId! },
          }),
        ).toBe(10_000);
        expect(await prisma.userAccount.findUnique({ where: { username: '999999' } })).toBeNull();
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS care_test_reject_membership ON "OrganizationMembership"',
        );
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS care_test_reject_membership()');
      }
    } finally {
      await measuredPrisma.$disconnect();
    }
  }, 300_000);
});
