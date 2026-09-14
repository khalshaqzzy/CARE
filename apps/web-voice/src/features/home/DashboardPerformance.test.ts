import { describe, expect, it } from 'vitest';
import { durationDisplay } from './DashboardPerformance';
describe('dashboard duration display', () => {
  it('uses unrounded seconds for the automatic 24-hour boundary', () => {
    expect(durationDisplay(86400)).toEqual({ value: '24.00', unit: 'hours' });
    expect(durationDisplay(86401)).toEqual({ value: '1.00', unit: 'days' });
    expect(durationDisplay(14400)).toEqual({ value: '4.00', unit: 'hours' });
    expect(durationDisplay(172800, 'hours')).toEqual({ value: '48.00', unit: 'hours' });
    expect(durationDisplay(3600, 'days')).toEqual({ value: '0.04', unit: 'days' });
    expect(durationDisplay(0).value).toBe('0.00');
    expect(durationDisplay(null).value).toBe('—');
  });
});
