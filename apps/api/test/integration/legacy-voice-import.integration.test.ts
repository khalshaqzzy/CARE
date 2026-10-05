import { PrismaClient, type OrganizationUnit, type UserAccount } from '@prisma/client';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import {
  commitLegacyImport,
  parseWib,
  planLegacyImport,
  readLegacyWorkbook,
} from '../../src/operations/legacy-voice-import';
import { OrganizationDashboard } from '../../src/voices/dashboard';
import { VoicesService } from '../../src/voices/voices.service';

const db = new PrismaClient();
const policy = new PolicyService(db as never);
const voices = new VoicesService(db as never, {} as never, {} as never, policy);
const dashboard = new OrganizationDashboard(db as never);
let manager: Principal, reporter: Principal;
let handling: OrganizationUnit, home: OrganizationUnit;

const HEADERS = [
  'Platform Asal *',
  'ID Voice Lama *',
  'Tanggal Submit *',
  'Jenis Voice *',
  'NoReg Pelapor *',
  'Nama Pelapor *',
  'Directorat Pelapor',
  'Division Pelapor *',
  'Department Pelapor *',
  'Section Pelapor',
  'Lokasi / Plant (platform lama) *',
  'Area CARE',
  'Detail Lokasi *',
  'Judul *',
  'Isi Voice *',
  'Kategori (platform lama) *',
  'Kategori CARE',
  'Prioritas (platform lama)',
  'Severity (diisi tim CARE)',
  'Directorat Penanganan',
  'Division Penanganan *',
  'Department Penanganan *',
  'Section Penanganan',
  'NoReg PIC Terakhir *',
  'Nama PIC Terakhir *',
  'Tanggal Respon Pertama',
  'Tanggal Ditutup *',
  'Catatan Penyelesaian',
  'Rating Pelapor (1-5)',
  'Feedback Pelapor',
  'Catatan PIC Platform Lama',
];
type Row = Record<string, string | number | Date>;
function row(overrides: Row = {}): Row {
  return {
    'Platform Asal *': 'Voice App Plant',
    'ID Voice Lama *': 'OLD-1',
    'Tanggal Submit *': '2025-03-14 09:00',
    'Jenis Voice *': 'General',
    'NoReg Pelapor *': 'LEG-R',
    'Nama Pelapor *': 'Legacy Reporter',
    'Division Pelapor *': 'legacy  division',
    'Department Pelapor *': 'Home Dept',
    'Section Pelapor': 'Line 2',
    'Lokasi / Plant (platform lama) *': 'KRW 1',
    'Area CARE': 'Karawang 1',
    'Detail Lokasi *': 'Gedung A',
    'Judul *': 'Lantai licin',
    'Isi Voice *': 'Lantai area welding licin.\nMohon dicek.',
    'Kategori (platform lama) *': 'K3',
    'Kategori CARE': 'Safety',
    'Severity (diisi tim CARE)': 'High',
    'Division Penanganan *': 'Legacy Division',
    'Department Penanganan *': 'handling dept',
    'NoReg PIC Terakhir *': 'LEG-M',
    'Nama PIC Terakhir *': 'Legacy Manager',
    'Tanggal Respon Pertama': '2025-03-14 11:00',
    'Tanggal Ditutup *': '2025-03-16 09:00',
    'Rating Pelapor (1-5)': 4,
    'Feedback Pelapor': 'Terima kasih',
    ...overrides,
  };
}
async function workbook(rows: Row[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Voice');
  sheet.addRow(HEADERS);
  // The template ships with one example row that must be ignored.
  sheet.addRow(HEADERS.map((h) => (h.startsWith('Platform') ? 'Voice App Plant' : '')));
  sheet.getCell('B2').value = 'VC-2025-00123';
  for (const values of rows) sheet.addRow(HEADERS.map((h) => values[h] ?? null));
  return readLegacyWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
}

describe('Legacy voice import', () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    // Truncating accounts cascades into the category catalog.
    const safety = await db.generalVoiceCategory.upsert({
      where: { key: 'SAFETY' },
      create: { key: 'SAFETY' },
      update: {},
    });
    if (!(await db.generalVoiceCategoryRevision.count({ where: { categoryId: safety.id } })))
      await db.generalVoiceCategoryRevision.create({
        data: {
          categoryId: safety.id,
          revision: 1,
          name: 'Safety',
          definition: 'Keselamatan kerja',
          examples: [],
        },
      });
    const snap = await db.organizationSnapshot.create({
      data: { checksum: 'l'.repeat(64), rowCount: 2, status: 'ACTIVE' },
    });
    handling = await db.organizationUnit.create({
      data: { directorate: 'Legacy Dir', division: 'Legacy Division', department: 'Handling Dept' },
    });
    home = await db.organizationUnit.create({
      data: { directorate: 'Legacy Dir', division: 'Legacy Division', department: 'Home Dept' },
    });
    const person = async (
      noReg: string,
      name: string,
      unit: OrganizationUnit,
      position: string,
    ) => {
      const employee = await db.employee.create({ data: { noReg, name } });
      const account: UserAccount = await db.userAccount.create({
        data: {
          username: noReg.toLowerCase(),
          displayName: name,
          passwordHash: 'test',
          accountKind: 'WORKFORCE',
          employeeId: employee.id,
        },
      });
      await db.organizationMembership.create({
        data: {
          snapshotId: snap.id,
          employeeId: employee.id,
          organizationUnitId: unit.id,
          employeeName: name,
          structuralPosition: position,
          section: 'Line 2',
          sourceRow: 1,
        },
      });
      return policy.resolvePrincipal(account, {
        id: crypto.randomUUID(),
        passwordRestricted: false,
      });
    };
    manager = await person('LEG-M', 'Legacy Manager', handling, 'Department Head');
    reporter = await person('LEG-R', 'Legacy Reporter', home, 'Member');
  });
  beforeEach(async () => {
    await db.rating.deleteMany();
    await db.closureCycle.deleteMany();
    await db.voiceEvent.deleteMany();
    await db.voice.deleteMany();
  });
  afterAll(() => db.$disconnect());

  it('reads template times as WIB wall clock', () => {
    expect(parseWib('2025-03-14 09:00')).toEqual(new Date('2025-03-14T02:00:00Z'));
    expect(parseWib(new Date(Date.UTC(2025, 2, 14, 9, 0)))).toEqual(
      new Date('2025-03-14T02:00:00Z'),
    );
    expect(parseWib('14/03/2025')).toBe('invalid');
    expect(parseWib('2025-02-30 10:00')).toBe('invalid');
  });

  it('reports every row problem in a dry run and writes nothing', async () => {
    const rows = await workbook([
      row(),
      row({ 'ID Voice Lama *': 'OLD-2', 'Tanggal Ditutup *': '' }),
      row({ 'ID Voice Lama *': 'OLD-3', 'Department Penanganan *': 'Gone Dept' }),
      row({ 'ID Voice Lama *': 'OLD-4', 'Tanggal Respon Pertama': '2025-03-13 08:00' }),
      row({
        'ID Voice Lama *': 'OLD-5',
        'Rating Pelapor (1-5)': 0,
        'Severity (diisi tim CARE)': '',
      }),
      row(),
    ]);
    expect(rows.map((r) => r.row)).toEqual([3, 4, 5, 6, 7, 8]);
    const { results } = await planLegacyImport(db, rows);
    expect(results.map((r) => r.result)).toEqual([
      'SIAP',
      'ERROR',
      'ERROR',
      'ERROR',
      'ERROR',
      'ERROR',
    ]);
    expect(results[1]!.messages.join()).toContain('Tanggal Ditutup wajib diisi');
    expect(results[2]!.messages.join()).toContain('Department Penanganan tidak ada');
    expect(results[3]!.messages.join()).toContain('lebih awal dari Tanggal Submit');
    expect(results[4]!.messages).toEqual(
      expect.arrayContaining([
        'Severity wajib diisi (Low, Medium, High, Critical)',
        'Rating Pelapor harus angka 1 sampai 5',
      ]),
    );
    expect(results[5]!.messages).toEqual(['ID Voice Lama sama dengan baris 3']);
    const outcome = await commitLegacyImport(db, rows);
    expect(outcome.committed).toBe(0);
    expect(await db.voice.count()).toBe(0);
  });

  it('imports closed Voices that feed the dashboard and skips them on a later batch', async () => {
    const rows = await workbook([
      row(),
      row({
        'ID Voice Lama *': 'OLD-2',
        'NoReg PIC Terakhir *': 'LEG-GONE',
        'Nama PIC Terakhir *': 'Former Manager',
        'Tanggal Respon Pertama': '',
        'Rating Pelapor (1-5)': '',
      }),
    ]);
    const first = await commitLegacyImport(db, rows);
    expect(first.results.map((r) => r.result)).toEqual(['DIMIGRASI', 'DIMIGRASI']);
    expect(first.results[1]!.messages.join()).toContain('dibuat sebagai akun nonaktif');

    const voice = await db.voice.findUniqueOrThrow({
      where: { legacySource_legacyId: { legacySource: 'Voice App Plant', legacyId: 'OLD-1' } },
      include: { closureCycles: { include: { rating: true } }, events: true },
    });
    expect(voice).toMatchObject({
      displayId: 'MIG-202503-000001',
      status: 'CLOSED',
      severity: 'HIGH',
      area: 'KARAWANG_1',
      categoryKey: 'SAFETY',
      currentCategoryKey: 'SAFETY',
      reporterId: reporter.accountId,
      reporterOrganizationUnitId: home.id,
      reporterDivisionSnapshot: 'Legacy Division',
      handlingDepartmentSnapshot: 'Handling Dept',
      handlingOrganizationSource: 'LEGACY_IMPORT',
      routeOwnerId: manager.accountId,
      detail: 'Lantai area welding licin.\nMohon dicek.',
      submittedAt: new Date('2025-03-14T02:00:00Z'),
    });
    expect(voice.closureCycles[0]).toMatchObject({
      reviewState: 'ACCEPTED',
      closedAt: new Date('2025-03-16T02:00:00Z'),
      rating: { score: 4, feedback: 'Terima kasih' },
    });
    expect(voice.events.map((e) => e.type).sort()).toEqual([
      'CLOSED',
      'RATED',
      'RESPONDED',
      'SUBMITTED',
    ]);
    const former = await db.userAccount.findUniqueOrThrow({ where: { username: 'leg-gone' } });
    expect(former).toMatchObject({ status: 'INACTIVE', accountKind: 'WORKFORCE' });
    expect(await db.notification.count()).toBe(0);

    const result = await dashboard.aggregate(manager, { basis: 'HANDLING' });
    expect(result.total).toBe(2);
    expect(result.handlingUnresolved).toBe(0);
    expect(result.performance).toMatchObject({
      averageResponseSeconds: 7200,
      responseSampleCount: 1,
      averageCompletionSeconds: 172800,
      completionSampleCount: 2,
      averageFeedbackScore: 4,
      feedbackSampleCount: 1,
    });

    const unrated = await db.voice.findFirstOrThrow({ where: { legacyId: 'OLD-2' } });
    const detail = await voices.detail(reporter, unrated.id);
    expect(detail.availableActions).not.toContain('RATE');
    const found = await voices.listMine(reporter, { search: 'old-1' });
    expect(found.items.map((v: { id: string }) => v.id)).toEqual([voice.id]);

    const next = await commitLegacyImport(
      db,
      await workbook([
        row(),
        row({
          'ID Voice Lama *': 'OLD-3',
          'Tanggal Submit *': '2025-03-20 08:00',
          'Tanggal Respon Pertama': '',
          'Tanggal Ditutup *': '2025-03-21 08:00',
        }),
      ]),
    );
    expect(next.results.map((r) => r.result)).toEqual(['DILEWATI', 'DIMIGRASI']);
    expect(next.results[0]!.messages).toEqual(['Sudah ada di CARE sebagai MIG-202503-000001']);
    expect(next.results[1]!.messages[0]).toBe('MIG-202503-000003');
    expect(await db.voice.count()).toBe(3);
  });
});
