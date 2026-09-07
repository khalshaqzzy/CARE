import { describe, expect, it } from 'vitest';
import { dashboardDates, isDashboardDate } from './dashboard-range';
describe('Jakarta dashboard calendar', () => {
  const now = new Date('2026-08-28T12:00:00Z');
  it('uses Jakarta calendar boundaries independent of the host timezone', () => {
    expect(dashboardDates('30d', undefined, undefined, now)).toEqual({
      from: '2026-07-29T17:00:00.000Z',
      to: now.toISOString(),
    });
    expect(dashboardDates('custom', '2026-08-01', '2026-08-02')).toEqual({
      from: '2026-07-31T17:00:00.000Z',
      to: '2026-08-02T16:59:59.999Z',
    });
    expect(dashboardDates('all')).toEqual({});
  });
  it('rolls year and day at Jakarta midnight and refreshes the current bound', () => {
    expect(
      dashboardDates('year', undefined, undefined, new Date('2026-12-31T17:00:00Z')).from,
    ).toBe('2026-12-31T17:00:00.000Z');
    expect(dashboardDates('30d', undefined, undefined, new Date(now.getTime() + 3000)).to).toBe(
      '2026-08-28T12:00:03.000Z',
    );
    expect(dashboardDates('90d', undefined, undefined, new Date('2026-01-01T00:00:00Z')).from).toBe(
      '2025-10-03T17:00:00.000Z',
    );
  });
  it('validates real calendar days and supports leap days', () => {
    expect(isDashboardDate('2024-02-29')).toBe(true);
    for (const day of ['2026-02-29', '2026-02-30', '2026-13-01', 'invalid']) {
      expect(isDashboardDate(day)).toBe(false);
      expect(() => dashboardDates('custom', day, '2027-01-01')).toThrow();
    }
    expect(() => dashboardDates('custom', '2026-08-02', '2026-08-01')).toThrow();
  });
});
