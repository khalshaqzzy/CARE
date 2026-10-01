import { describe, expect, it } from 'vitest';
import {
  addWorkingTime,
  isWorkingDay,
  jakartaDateKey,
  type WorkingCalendar,
} from '../../src/escalation/working-time';

const standard: WorkingCalendar = { useStandard: true, exceptions: new Map() };
const custom = (entries: Array<[string, 'HOLIDAY' | 'WORKDAY']>): WorkingCalendar => ({
  useStandard: false,
  exceptions: new Map(entries),
});
// 2026-10-02 is a Friday; 10:00 WIB is 03:00Z.
const fridayTen = new Date('2026-10-02T03:00:00Z');

describe('working calendar', () => {
  it('uses WIB dates', () => {
    expect(jakartaDateKey(new Date('2026-10-02T16:59:59Z'))).toBe('2026-10-02');
    expect(jakartaDateKey(new Date('2026-10-02T17:00:00Z'))).toBe('2026-10-03');
  });

  it('treats Monday-Friday as working days and ignores exceptions on the standard calendar', () => {
    expect(isWorkingDay('2026-10-02', standard)).toBe(true);
    expect(isWorkingDay('2026-10-03', standard)).toBe(false);
    const ignored: WorkingCalendar = {
      useStandard: true,
      exceptions: new Map([['2026-10-02', 'HOLIDAY']]),
    };
    expect(isWorkingDay('2026-10-02', ignored)).toBe(true);
  });

  it('applies holiday and extra working-day exceptions on a custom calendar', () => {
    const calendar = custom([
      ['2026-10-05', 'HOLIDAY'],
      ['2026-10-03', 'WORKDAY'],
    ]);
    expect(isWorkingDay('2026-10-05', calendar)).toBe(false);
    expect(isWorkingDay('2026-10-03', calendar)).toBe(true);
  });
});

describe('deadline arithmetic', () => {
  it('adds calendar hours around the clock', () => {
    expect(addWorkingTime(fridayTen, 4, 'CALENDAR_HOUR', standard).toISOString()).toBe(
      '2026-10-02T07:00:00.000Z',
    );
  });

  it('keeps the time of day and skips the weekend', () => {
    expect(addWorkingTime(fridayTen, 1, 'WORKING_DAY', standard).toISOString()).toBe(
      '2026-10-05T03:00:00.000Z',
    );
    expect(addWorkingTime(fridayTen, 3, 'WORKING_DAY', standard).toISOString()).toBe(
      '2026-10-07T03:00:00.000Z',
    );
  });

  it('starts a non-working-day report at the next working day', () => {
    const saturday = new Date('2026-10-03T07:00:00Z');
    expect(addWorkingTime(saturday, 1, 'WORKING_DAY', standard).toISOString()).toBe(
      '2026-10-05T17:00:00.000Z',
    );
  });

  it('skips custom holidays and counts extra working days', () => {
    const calendar = custom([
      ['2026-10-05', 'HOLIDAY'],
      ['2026-10-03', 'WORKDAY'],
    ]);
    expect(addWorkingTime(fridayTen, 1, 'WORKING_DAY', calendar).toISOString()).toBe(
      '2026-10-03T03:00:00.000Z',
    );
    expect(addWorkingTime(fridayTen, 2, 'WORKING_DAY', calendar).toISOString()).toBe(
      '2026-10-06T03:00:00.000Z',
    );
  });

  it('rejects non-positive amounts', () => {
    expect(() => addWorkingTime(fridayTen, 0, 'WORKING_DAY', standard)).toThrow();
  });
});
