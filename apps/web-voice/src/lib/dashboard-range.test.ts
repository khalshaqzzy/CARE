import { describe, expect, it } from 'vitest';
import { dashboardDates } from './dashboard-range';

describe('dashboardDates', () => {
  const now = new Date('2026-08-28T12:00:00.000Z');

  it('defaults a 30 day window including today', () => {
    const range = dashboardDates('30d', undefined, undefined, now);
    expect(new Date(range.from!).getDate()).toBe(30);
    expect(new Date(range.from!).getHours()).toBe(0);
    expect(range.to).toBe(now.toISOString());
  });

  it('keeps all-time unbounded and maps custom calendar dates', () => {
    expect(dashboardDates('all', undefined, undefined, now)).toEqual({});
    const custom = dashboardDates('custom', '2026-08-01', '2026-08-02', now);
    expect(new Date(custom.from!).getDate()).toBe(1);
    expect(new Date(custom.from!).getHours()).toBe(0);
    expect(new Date(custom.to!).getDate()).toBe(2);
    expect(new Date(custom.to!).getHours()).toBe(23);
  });
});
