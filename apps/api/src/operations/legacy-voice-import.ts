import {
  AccountKind,
  AccountStatus,
  Area,
  ClosureReviewState,
  HandlerType,
  Prisma,
  PrismaClient,
  Severity,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { hash } from 'argon2';
import ExcelJS from 'exceljs';

/**
 * One-off migration of closed Voices from earlier member-voice platforms
 * (docs/migration/Template_Migrasi_Voice_CARE.xlsx). A dry run validates every
 * row against CARE data; a commit writes them all in one transaction or none.
 * A (platform, ID) pair already in CARE is skipped, so later batches may repeat
 * rows. Nothing is notified, classified or escalated.
 */

export const LEGACY_SHEET = 'Voice';
export const LEGACY_HANDLING_SOURCE = 'LEGACY_IMPORT';
const TEMPLATE_EXAMPLE = { platform: 'Voice App Plant', legacyId: 'VC-2025-00123' };
const WIB_OFFSET_MS = 7 * 3_600_000;

const FIELDS = {
  'platform asal': 'platform',
  'id voice lama': 'legacyId',
  'tanggal submit': 'submittedAt',
  'jenis voice': 'visibility',
  'noreg pelapor': 'reporterNoReg',
  'nama pelapor': 'reporterName',
  'directorat pelapor': 'reporterDirectorate',
  'division pelapor': 'reporterDivision',
  'department pelapor': 'reporterDepartment',
  'section pelapor': 'reporterSection',
  'lokasi / plant (platform lama)': 'legacyLocation',
  'area care': 'area',
  'detail lokasi': 'locationDetail',
  judul: 'title',
  'isi voice': 'detail',
  'kategori (platform lama)': 'legacyCategory',
  'kategori care': 'category',
  'prioritas (platform lama)': 'legacyPriority',
  'severity (diisi tim care)': 'severity',
  'directorat penanganan': 'handlingDirectorate',
  'division penanganan': 'handlingDivision',
  'department penanganan': 'handlingDepartment',
  'section penanganan': 'handlingSection',
  'noreg pic terakhir': 'picNoReg',
  'nama pic terakhir': 'picName',
  'tanggal respon pertama': 'respondedAt',
  'tanggal ditutup': 'closedAt',
  'catatan penyelesaian': 'closureNote',
  'rating pelapor (1-5)': 'rating',
  'feedback pelapor': 'feedback',
  'catatan pic platform lama': 'picNote',
} as const;
type Field = (typeof FIELDS)[keyof typeof FIELDS];
const REQUIRED_HEADERS: Field[] = [
  'platform',
  'legacyId',
  'submittedAt',
  'visibility',
  'reporterNoReg',
  'reporterName',
  'reporterDivision',
  'reporterDepartment',
  'locationDetail',
  'title',
  'detail',
  'area',
  'category',
  'severity',
  'handlingDivision',
  'handlingDepartment',
  'picNoReg',
  'picName',
  'closedAt',
];

type Cell = string | number | Date | null;
export type LegacyRow = { row: number; values: Partial<Record<Field, Cell>> };
export type RowResult = {
  row: number;
  platform: string;
  legacyId: string;
  result: 'SIAP' | 'DIMIGRASI' | 'DILEWATI' | 'ERROR';
  messages: string[];
};

type Unit = { id: string; directorate: string; division: string; department: string };
type Person = { noReg: string; name: string };
type Planned = {
  row: number;
  platform: string;
  legacyId: string;
  submittedAt: Date;
  visibility: VoiceVisibility;
  reporter: Person;
  reporterUnit: Unit | null;
  reporterSnapshot: { directorate: string | null; division: string; department: string };
  reporterSection: string | null;
  area: Area;
  locationDetail: string;
  title: string;
  detail: string;
  category: { id: string; key: string; name: string } | null;
  severity: Severity;
  handlingUnit: Unit | null;
  handlingSection: string | null;
  pic: Person;
  respondedAt: Date | null;
  closedAt: Date;
  closureNote: string;
  rating: number | null;
  feedback: string | null;
};

const squash = (value: string) => value.trim().replace(/\s+/g, ' ');
const key = (value: string) => squash(value).toLocaleLowerCase('en-US');
const usernameOf = (noReg: string) => noReg.toLocaleLowerCase('en-US');

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
  }
  return null;
}

function text(value: Cell | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return squash(String(value));
}

/** Multi-line Voice text keeps its line breaks; only the ends are trimmed. */
function longText(value: Cell | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

/**
 * Template times are WIB wall-clock. A typed text cell reads "YYYY-MM-DD HH:MM";
 * a cell Excel turned into a date carries the same wall clock in its UTC fields.
 */
export function parseWib(value: Cell | undefined): Date | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? new Date(value.getTime() - WIB_OFFSET_MS) : 'invalid';
  if (typeof value === 'number') return 'invalid';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    value.trim(),
  );
  if (!match) return 'invalid';
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
  const wall = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== +y! ||
    check.getUTCMonth() !== +mo! - 1 ||
    check.getUTCDate() !== +d! ||
    +h > 23
  )
    return 'invalid';
  return new Date(wall - WIB_OFFSET_MS);
}

export async function readLegacyWorkbook(buffer: Buffer): Promise<LegacyRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet(LEGACY_SHEET);
  if (!sheet) throw new Error(`Sheet "${LEGACY_SHEET}" tidak ditemukan`);
  const columns = new Map<number, Field>();
  sheet.getRow(1).eachCell((cell, column) => {
    const header = key(text(cellValue(cell.value)).replace(/\*$/, ''));
    const field = (FIELDS as Record<string, Field>)[header];
    if (field) columns.set(column, field);
  });
  const found = new Set(columns.values());
  const missing = REQUIRED_HEADERS.filter((field) => !found.has(field));
  if (missing.length)
    throw new Error(
      `Kolom template tidak lengkap: ${missing.join(', ')} (gunakan template terbaru)`,
    );
  const rows: LegacyRow[] = [];
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const source = sheet.getRow(number);
    const values: LegacyRow['values'] = {};
    for (const [column, field] of columns) values[field] = cellValue(source.getCell(column).value);
    if (Object.values(values).every((value) => text(value) === '')) continue;
    if (
      text(values.platform) === TEMPLATE_EXAMPLE.platform &&
      text(values.legacyId) === TEMPLATE_EXAMPLE.legacyId
    )
      continue;
    rows.push({ row: number, values });
  }
  return rows;
}

const VISIBILITY: Record<string, VoiceVisibility> = {
  general: VoiceVisibility.GENERAL,
  private: VoiceVisibility.PRIVATE,
};
const SEVERITY: Record<string, Severity> = {
  low: Severity.LOW,
  medium: Severity.MEDIUM,
  high: Severity.HIGH,
  critical: Severity.CRITICAL,
};
const AREA: Record<string, Area> = {
  'karawang 1': Area.KARAWANG_1,
  'karawang 2': Area.KARAWANG_2,
  'karawang 3': Area.KARAWANG_3,
  'sunter 1': Area.SUNTER_1,
  'sunter 2': Area.SUNTER_2,
};

function noRegText(value: Cell | undefined) {
  // A NoReg typed into a number cell reads back as a number; leading zeros are lost.
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  return text(value);
}

async function loadReference(db: PrismaClient | Prisma.TransactionClient, rows: LegacyRow[]) {
  const [units, categories] = await Promise.all([
    db.organizationUnit.findMany({
      select: { id: true, directorate: true, division: true, department: true },
    }),
    db.generalVoiceCategory.findMany({
      select: {
        id: true,
        key: true,
        revisions: { where: { effectiveTo: null }, select: { name: true }, take: 1 },
      },
    }),
  ]);
  const usernames = [
    ...new Set(
      rows.flatMap((r) =>
        [noRegText(r.values.reporterNoReg), noRegText(r.values.picNoReg)]
          .filter(Boolean)
          .map(usernameOf),
      ),
    ),
  ];
  const accounts = await db.userAccount.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true, accountKind: true, employeeId: true },
  });
  const pairs = rows.map((r) => ({
    legacySource: text(r.values.platform),
    legacyId: text(r.values.legacyId),
  }));
  const existing = pairs.length
    ? await db.voice.findMany({
        where: { OR: pairs },
        select: { legacySource: true, legacyId: true, displayId: true },
      })
    : [];
  const categoryByName = new Map<string, { id: string; key: string; name: string }>();
  for (const category of categories) {
    const name = category.revisions[0]?.name ?? category.key;
    const entry = { id: category.id, key: category.key, name };
    categoryByName.set(key(name), entry);
    categoryByName.set(key(category.key), entry);
  }
  return {
    units,
    categoryByName,
    accounts: new Map(accounts.map((a) => [a.username, a])),
    existing: new Map(existing.map((v) => [`${v.legacySource}\u0000${v.legacyId}`, v.displayId])),
  };
}

function findUnit(
  units: Unit[],
  directorate: string,
  division: string,
  department: string,
): Unit | 'ambiguous' | null {
  const matches = units.filter(
    (u) =>
      key(u.division) === key(division) &&
      key(u.department) === key(department) &&
      (!directorate || key(u.directorate) === key(directorate)),
  );
  if (matches.length > 1) return 'ambiguous';
  return matches[0] ?? null;
}

/** Validates every row; rows already in CARE come back as DILEWATI. */
export async function planLegacyImport(
  db: PrismaClient | Prisma.TransactionClient,
  rows: LegacyRow[],
  now = new Date(),
): Promise<{ results: RowResult[]; planned: Planned[] }> {
  const reference = await loadReference(db, rows);
  const results: RowResult[] = [];
  const planned: Planned[] = [];
  const seen = new Map<string, number>();
  for (const { row, values } of rows) {
    const errors: string[] = [];
    const notes: string[] = [];
    const platform = text(values.platform);
    const legacyId = text(values.legacyId);
    const result: RowResult = { row, platform, legacyId, result: 'ERROR', messages: errors };
    results.push(result);
    const required = (field: Field, label: string) => {
      if (!text(values[field])) errors.push(`${label} wajib diisi`);
    };
    required('platform', 'Platform Asal');
    required('legacyId', 'ID Voice Lama');
    if (platform.length > 80) errors.push('Platform Asal maksimal 80 karakter');
    if (legacyId.length > 100) errors.push('ID Voice Lama maksimal 100 karakter');
    const pairKey = `${platform}\u0000${legacyId}`;
    if (platform && legacyId) {
      const earlier = seen.get(pairKey);
      if (earlier) errors.push(`ID Voice Lama sama dengan baris ${earlier}`);
      else seen.set(pairKey, row);
      const displayId = reference.existing.get(pairKey);
      if (displayId && !earlier) {
        result.result = 'DILEWATI';
        result.messages = [`Sudah ada di CARE sebagai ${displayId}`];
        continue;
      }
    }

    const visibility = VISIBILITY[key(text(values.visibility))];
    if (!visibility) errors.push('Jenis Voice harus General atau Private');
    const general = visibility === VoiceVisibility.GENERAL;

    const dates = {} as Record<'submittedAt' | 'respondedAt' | 'closedAt', Date | null>;
    for (const [field, label] of [
      ['submittedAt', 'Tanggal Submit'],
      ['respondedAt', 'Tanggal Respon Pertama'],
      ['closedAt', 'Tanggal Ditutup'],
    ] as const) {
      const parsed = parseWib(values[field]);
      if (parsed === 'invalid') {
        errors.push(`${label} harus berformat YYYY-MM-DD HH:MM`);
        dates[field] = null;
      } else {
        if (parsed && parsed > now) errors.push(`${label} tidak boleh di masa depan`);
        dates[field] = parsed;
      }
    }
    if (!values.submittedAt) errors.push('Tanggal Submit wajib diisi');
    if (!values.closedAt)
      errors.push('Tanggal Ditutup wajib diisi (hanya voice yang sudah selesai)');
    const { submittedAt, respondedAt, closedAt } = dates;
    if (submittedAt && respondedAt && respondedAt < submittedAt)
      errors.push('Tanggal Respon Pertama lebih awal dari Tanggal Submit');
    if (submittedAt && closedAt && closedAt < submittedAt)
      errors.push('Tanggal Ditutup lebih awal dari Tanggal Submit');
    if (respondedAt && closedAt && closedAt < respondedAt)
      errors.push('Tanggal Ditutup lebih awal dari Tanggal Respon Pertama');

    const reporter = { noReg: noRegText(values.reporterNoReg), name: text(values.reporterName) };
    const pic = { noReg: noRegText(values.picNoReg), name: text(values.picName) };
    for (const [person, label] of [
      [reporter, 'Pelapor'],
      [pic, 'PIC Terakhir'],
    ] as const) {
      if (!person.noReg) errors.push(`NoReg ${label} wajib diisi`);
      else if (person.noReg.length > 64) errors.push(`NoReg ${label} maksimal 64 karakter`);
      if (!person.name) errors.push(`Nama ${label} wajib diisi`);
      else if (person.name.length > 200) errors.push(`Nama ${label} maksimal 200 karakter`);
      const account = person.noReg ? reference.accounts.get(usernameOf(person.noReg)) : undefined;
      if (account && account.accountKind !== AccountKind.WORKFORCE)
        errors.push(`NoReg ${label} dipakai akun non-karyawan`);
      else if (person.noReg && !account)
        notes.push(
          `NoReg ${label} ${person.noReg} belum ada di CARE; dibuat sebagai akun nonaktif`,
        );
    }

    const reporterDivision = text(values.reporterDivision);
    const reporterDepartment = text(values.reporterDepartment);
    const reporterDirectorate = text(values.reporterDirectorate);
    if (!reporterDivision) errors.push('Division Pelapor wajib diisi');
    if (!reporterDepartment) errors.push('Department Pelapor wajib diisi');
    let reporterUnit: Unit | null = null;
    if (reporterDivision && reporterDepartment) {
      const found = findUnit(
        reference.units,
        reporterDirectorate,
        reporterDivision,
        reporterDepartment,
      );
      if (found === 'ambiguous')
        errors.push('Department Pelapor ada di beberapa directorat; isi Directorat Pelapor');
      else if (found) reporterUnit = found;
      else
        notes.push(
          'Department Pelapor tidak ada di organisasi CARE saat ini; disimpan sesuai file',
        );
    }

    let handlingUnit: Unit | null = null;
    if (general) {
      const division = text(values.handlingDivision);
      const department = text(values.handlingDepartment);
      if (!division || !department)
        errors.push('Division dan Department Penanganan wajib diisi untuk General');
      else {
        const found = findUnit(
          reference.units,
          text(values.handlingDirectorate),
          division,
          department,
        );
        if (found === 'ambiguous')
          errors.push(
            'Department Penanganan ada di beberapa directorat; isi Directorat Penanganan',
          );
        else if (!found)
          errors.push(
            'Department Penanganan tidak ada di organisasi CARE; tulis nama department CARE saat ini',
          );
        else handlingUnit = found;
      }
    }

    const area = AREA[key(text(values.area))];
    if (!area) errors.push('Area CARE wajib diisi dari daftar pilihan');
    const severity = SEVERITY[key(text(values.severity))];
    if (!severity) errors.push('Severity wajib diisi (Low, Medium, High, Critical)');
    let category: Planned['category'] = null;
    if (general) {
      category = reference.categoryByName.get(key(text(values.category))) ?? null;
      if (!category) errors.push('Kategori CARE wajib diisi dari daftar pilihan untuk General');
    }

    const locationDetail = text(values.locationDetail);
    const title = text(values.title);
    const detail = longText(values.detail);
    const closureNote = longText(values.closureNote);
    const feedback = longText(values.feedback);
    for (const [value, label, max] of [
      [locationDetail, 'Detail Lokasi', 200],
      [title, 'Judul', 150],
      [detail, 'Isi Voice', 5000],
    ] as const) {
      if (!value) errors.push(`${label} wajib diisi`);
      else if (value.length > max) errors.push(`${label} maksimal ${max} karakter`);
    }
    if (closureNote.length > 4000) errors.push('Catatan Penyelesaian maksimal 4.000 karakter');
    if (feedback.length > 2000) errors.push('Feedback Pelapor maksimal 2.000 karakter');
    let rating: number | null = null;
    const ratingText = text(values.rating);
    if (ratingText) {
      rating = Number(ratingText);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push('Rating Pelapor harus angka 1 sampai 5');
        rating = null;
      }
    }
    if (feedback && rating === null && !ratingText)
      notes.push('Feedback Pelapor diabaikan karena tidak ada rating');

    if (errors.length) continue;
    result.result = 'SIAP';
    result.messages = notes;
    planned.push({
      row,
      platform,
      legacyId,
      submittedAt: submittedAt!,
      visibility: visibility!,
      reporter,
      reporterUnit,
      reporterSnapshot: reporterUnit
        ? {
            directorate: reporterUnit.directorate,
            division: reporterUnit.division,
            department: reporterUnit.department,
          }
        : {
            directorate: reporterDirectorate || null,
            division: reporterDivision,
            department: reporterDepartment,
          },
      reporterSection: text(values.reporterSection) || null,
      area: area!,
      locationDetail,
      title,
      detail,
      category,
      severity: severity!,
      handlingUnit,
      handlingSection: general ? text(values.handlingSection) || null : null,
      pic,
      respondedAt,
      closedAt: closedAt!,
      closureNote: closureNote || 'Diselesaikan di platform sebelumnya.',
      rating,
      feedback: rating !== null && feedback ? feedback : null,
    });
  }
  return { results, planned };
}

const ORG_IMPORT_HASH = { type: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Writes every planned Voice in one transaction; any failure writes nothing. */
export async function commitLegacyImport(prisma: PrismaClient, rows: LegacyRow[]) {
  const preview = await planLegacyImport(prisma, rows);
  if (preview.results.some((r) => r.result === 'ERROR')) return { ...preview, committed: 0 };
  // Missing people become inactive workforce accounts with the same initial
  // password the organization import gives, so a later HR file can activate them.
  const people = new Map<string, Person>();
  for (const voice of preview.planned)
    for (const person of [voice.reporter, voice.pic]) people.set(usernameOf(person.noReg), person);
  const known = new Set(
    (
      await prisma.userAccount.findMany({
        where: { username: { in: [...people.keys()] } },
        select: { username: true },
      })
    ).map((a) => a.username),
  );
  const hashes = new Map<string, string>();
  for (const username of people.keys())
    if (!known.has(username)) hashes.set(username, await hash(username, ORG_IMPORT_HASH));

  const outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('care:legacy-voice-import'))`;
      // Re-plan under the lock so a concurrent batch cannot slip in duplicates.
      const { results, planned } = await planLegacyImport(tx, rows);
      if (results.some((r) => r.result === 'ERROR')) return { results, planned, committed: 0 };
      const accountIds = new Map<string, string>();
      const existing = await tx.userAccount.findMany({
        where: { username: { in: [...people.keys()] } },
        select: { id: true, username: true },
      });
      for (const account of existing) accountIds.set(account.username, account.id);
      const deactivatedAt = new Date();
      for (const [username, person] of people) {
        if (accountIds.has(username)) continue;
        const employee = await tx.employee.upsert({
          where: { noReg: person.noReg },
          create: { noReg: person.noReg, name: person.name, active: false },
          update: {},
        });
        const account = await tx.userAccount.create({
          data: {
            employeeId: employee.id,
            username,
            displayName: person.name,
            passwordHash: hashes.get(username)!,
            accountKind: AccountKind.WORKFORCE,
            status: AccountStatus.INACTIVE,
            deactivatedAt,
          },
        });
        accountIds.set(username, account.id);
      }
      const sequences = new Map<string, number>();
      const nextDisplayId = async (submittedAt: Date) => {
        const period = new Date(submittedAt.getTime() + WIB_OFFSET_MS)
          .toISOString()
          .slice(0, 7)
          .replace('-', '');
        if (!sequences.has(period)) {
          const last = await tx.voice.findFirst({
            where: { displayId: { startsWith: `MIG-${period}-` } },
            orderBy: { displayId: 'desc' },
            select: { displayId: true },
          });
          sequences.set(period, last ? Number(last.displayId.slice(-6)) : 0);
        }
        const value = sequences.get(period)! + 1;
        sequences.set(period, value);
        return `MIG-${period}-${String(value).padStart(6, '0')}`;
      };
      const actor = {
        actorAccountKind: AccountKind.WORKFORCE,
        actorStructuralPosition: null,
        actorCapabilities: [],
      };
      for (const item of planned) {
        const reporterId = accountIds.get(usernameOf(item.reporter.noReg))!;
        const picId = accountIds.get(usernameOf(item.pic.noReg))!;
        const general = item.visibility === VoiceVisibility.GENERAL;
        const displayId = await nextDisplayId(item.submittedAt);
        const unit = item.handlingUnit;
        const category = item.category;
        const voice = await tx.voice.create({
          data: {
            displayId,
            legacySource: item.platform,
            legacyId: item.legacyId,
            reporterId,
            visibility: item.visibility,
            area: item.area,
            reporterOrganizationUnitId: item.reporterUnit?.id ?? null,
            reporterNoRegSnapshot: item.reporter.noReg,
            reporterNameSnapshot: item.reporter.name,
            reporterDirectorateSnapshot: item.reporterSnapshot.directorate,
            reporterDivisionSnapshot: item.reporterSnapshot.division,
            reporterDepartmentSnapshot: item.reporterSnapshot.department,
            reporterSectionSnapshot: item.reporterSection,
            ...(general && unit
              ? {
                  handlingOrganizationUnitId: unit.id,
                  handlingDirectorateSnapshot: unit.directorate,
                  handlingDivisionSnapshot: unit.division,
                  handlingDepartmentSnapshot: unit.department,
                  handlingSectionSnapshot: item.handlingSection,
                  handlingOrganizationSource: LEGACY_HANDLING_SOURCE,
                }
              : {}),
            // Consent was never asked on the old platform: the identity stays hidden.
            showReporterIdentity: general ? null : false,
            locationDetail: item.locationDetail,
            title: item.title,
            detail: item.detail,
            categoryKey: category?.key ?? null,
            categoryId: category?.id ?? null,
            categoryNameSnapshot: category?.name ?? null,
            currentCategoryKey: category?.key ?? null,
            currentCategoryId: category?.id ?? null,
            currentCategoryNameSnapshot: category?.name ?? null,
            severity: item.severity,
            status: VoiceStatus.CLOSED,
            routeOwnerId: picId,
            currentHandlerId: picId,
            handlerType: general ? HandlerType.MANAGER : HandlerType.UNION_HEAD,
            anonymousAlias: `Reporter-${displayId.slice(-6)}`,
            submittedAt: item.submittedAt,
          },
        });
        const migrated = { migrated: true, legacySource: item.platform, legacyId: item.legacyId };
        await tx.voiceEvent.create({
          data: {
            voiceId: voice.id,
            actorId: reporterId,
            ...actor,
            type: VoiceEventType.SUBMITTED,
            payload: { visibility: voice.visibility, category: voice.categoryKey, ...migrated },
            occurredAt: item.submittedAt,
          },
        });
        if (item.respondedAt)
          await tx.voiceEvent.create({
            data: {
              voiceId: voice.id,
              actorId: picId,
              ...actor,
              type: VoiceEventType.RESPONDED,
              payload: migrated,
              occurredAt: item.respondedAt,
            },
          });
        const closure = await tx.closureCycle.create({
          data: {
            voiceId: voice.id,
            cycleNumber: 1,
            actorId: picId,
            note: item.closureNote,
            closedAt: item.closedAt,
            reviewState: ClosureReviewState.ACCEPTED,
            reviewDeadline: item.closedAt,
            reviewResolvedAt: item.closedAt,
          },
        });
        await tx.voiceEvent.create({
          data: {
            voiceId: voice.id,
            actorId: picId,
            ...actor,
            type: VoiceEventType.CLOSED,
            payload: { closureId: closure.id, evidenceCount: 0, ...migrated },
            occurredAt: item.closedAt,
          },
        });
        if (item.rating !== null) {
          await tx.rating.create({
            data: {
              closureCycleId: closure.id,
              reporterId,
              score: item.rating,
              feedback: item.feedback,
              createdAt: item.closedAt,
            },
          });
          await tx.voiceEvent.create({
            data: {
              voiceId: voice.id,
              actorId: reporterId,
              ...actor,
              type: VoiceEventType.RATED,
              payload: { score: item.rating, reopen: false, ...migrated },
              occurredAt: item.closedAt,
            },
          });
        }
        const result = results.find((r) => r.row === item.row)!;
        result.result = 'DIMIGRASI';
        result.messages = [displayId, ...result.messages];
      }
      return { results, planned, committed: planned.length };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
  return outcome;
}

const csvCell = (value: string | number) => {
  const raw = String(value);
  // Keep spreadsheet apps from evaluating text that starts like a formula.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reportCsv(results: RowResult[]) {
  const lines = [['Baris', 'Platform Asal', 'ID Voice Lama', 'Hasil', 'Keterangan']];
  for (const r of results)
    lines.push([String(r.row), r.platform, r.legacyId, r.result, r.messages.join('; ')]);
  return '﻿' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
