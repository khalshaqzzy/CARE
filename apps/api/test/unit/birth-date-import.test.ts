import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseBirthDate } from '../../src/common/birth-date';
import {
  ImportsService,
  ORGANIZATION_HEADERS,
  ORGANIZATION_BIRTH_DATE_HEADERS,
} from '../../src/imports/imports.service';
const imports = new ImportsService({} as never);
const row = [
  '00123456',
  'Synthetic Member',
  'Team Member',
  'Manufacturing',
  'Division',
  'Department',
  '',
];
async function workbook(date: ExcelJS.CellValue, legacy = false, date1904 = false) {
  const book = new ExcelJS.Workbook();
  book.properties.date1904 = date1904;
  const sheet = book.addWorksheet('MFG + QD');
  sheet.addRow(legacy ? [...ORGANIZATION_HEADERS] : [...ORGANIZATION_BIRTH_DATE_HEADERS]);
  sheet.addRow(legacy ? row : [...row.slice(0, 3), date, ...row.slice(3)]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
describe('Calendar-only birth dates and organization import', () => {
  it('validates ISO calendar dates without locale guessing', () => {
    expect(parseBirthDate('2000-02-29')).toBe('2000-02-29');
    for (const date of [
      '2001-02-29',
      '1990-02-31',
      '01/02/1990',
      '1990-2-01',
      '2999-01-01',
      '',
      null,
    ])
      expect(parseBirthDate(date)).toBeNull();
    expect(parseBirthDate('2025-03-29')).toBe('2025-03-29');
  });
  it('preserves legacy omitted DOB, leading zeros and empty sections', async () => {
    const rows = await imports.parse(await workbook(null, true));
    expect(rows[0]).toMatchObject({ noReg: '00123456', section: '' });
    expect(rows[0]).not.toHaveProperty('birthDate');
  });
  it('reads XLSX dates in both Excel epochs and explicit blank dates', async () => {
    for (const epoch of [false, true])
      expect(
        (await imports.parse(await workbook(new Date('1990-02-28T00:00:00Z'), false, epoch)))[0]
          ?.birthDate,
      ).toBe('1990-02-28');
    expect((await imports.parse(await workbook(null)))[0]?.birthDate).toBeNull();
    expect((await imports.parse(await workbook('1990-02-28')))[0]?.birthDate).toBe('1990-02-28');
  });
  it('rejects formulas, invalid dates, unexpected headers and non-date numeric cells', async () => {
    for (const date of [{ formula: 'TODAY()', result: 40000 }, '1990-02-30', 1234])
      await expect(imports.parse(await workbook(date))).rejects.toThrow();
    await expect(
      imports.parse(
        Buffer.from(
          [...ORGANIZATION_HEADERS, 'Unknown'].join(',') + '\n' + [...row, 'x'].join(','),
        ),
        'csv',
      ),
    ).rejects.toThrow();
  });
  it('accepts ISO CSV and rejects case-insensitive duplicate identifiers', async () => {
    const csv =
      [...ORGANIZATION_BIRTH_DATE_HEADERS].join(',') +
      '\n' +
      [...row.slice(0, 3), '1990-02-28', ...row.slice(3)].join(',');
    expect((await imports.parse(Buffer.from(csv), 'csv'))[0]?.birthDate).toBe('1990-02-28');
    const base =
      [...ORGANIZATION_HEADERS].join(',') +
      '\n' +
      ['TM123456', ...row.slice(1)].join(',') +
      '\n' +
      ['tm123456', ...row.slice(1)].join(',');
    await expect(imports.parse(Buffer.from(base), 'csv')).rejects.toThrow();
  });
});
