import { describe, expect, it } from 'vitest';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDate,
  formatDateTime,
  formatRelative,
  mediaUrl,
  SEVERITY_LABELS,
  severityRank,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from './formatters';

describe('workforce label maps', () => {
  it('covers the five areas', () => {
    expect(Object.keys(AREA_LABELS)).toEqual([
      'KARAWANG_1',
      'KARAWANG_2',
      'KARAWANG_3',
      'SUNTER_1',
      'SUNTER_2',
    ]);
  });

  it('labels every severity and status', () => {
    expect(Object.keys(SEVERITY_LABELS).sort()).toEqual(['CRITICAL', 'HIGH', 'LOW', 'MEDIUM']);
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([
      'CLOSED',
      'IN_PROGRESS',
      'IN_VERIFICATION',
      'OPEN',
    ]);
  });

  it('labels all routing categories', () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([
      'ENVIRONMENT',
      'FACILITY',
      'SAFETY',
      'WORK_DIFFICULTY',
    ]);
  });

  it('distinguishes visibility labels', () => {
    expect(VISIBILITY_LABELS.GENERAL).toBe('General');
    expect(VISIBILITY_LABELS.PRIVATE).toBe('Private');
  });
});

describe('severity ranking for severity-first sorting', () => {
  it('orders critical before low', () => {
    expect(severityRank('CRITICAL')).toBeGreaterThan(severityRank('LOW'));
    expect(severityRank('HIGH')).toBeGreaterThan(severityRank('MEDIUM'));
  });

  it('returns zero for unknown severity', () => {
    expect(severityRank('UNKNOWN')).toBe(0);
  });
});

describe('timestamp formatting uses Asia/Jakarta', () => {
  it('formats a date-time in the Jakarta timezone', () => {
    const input = new Date('2026-08-27T08:00:00Z');
    const formatted = formatDateTime(input);
    // 08:00 UTC === 15:00 WIB (Asia/Jakarta is UTC+7)
    expect(formatted).toContain('15.00');
  });

  it('returns em-dash for missing values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('renders a relative future/past value', () => {
    const past = new Date(Date.now() - 90 * 60_000);
    expect(formatRelative(past)).toContain('lalu');
  });
});

describe('media urls', () => {
  it('builds an authorized media URL', () => {
    expect(mediaUrl('abc-123')).toBe('/api/v1/media/abc-123');
  });
});
