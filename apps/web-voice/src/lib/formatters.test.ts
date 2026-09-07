import { describe, expect, it, vi } from 'vitest';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDate,
  formatDateTime,
  formatNotificationTime,
  formatRelative,
  formatRemaining,
  mediaUrl,
  SEVERITY_LABELS,
  severityRank,
  STATUS_LABELS,
  VISIBILITY_LABELS,
  voiceStatusDisplay,
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
      'FACILITY_REPAIR',
      'SAFETY',
      'WELFARE',
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

  it('falls through day into week buckets before the absolute date', () => {
    expect(formatRelative(new Date(Date.now() - 5 * 24 * 60 * 60_000))).toBe('5 hari lalu');
    expect(formatRelative(new Date(Date.now() - 13 * 24 * 60 * 60_000))).toBe('2 minggu lalu');
    const old = new Date(Date.now() - 40 * 24 * 60 * 60_000);
    expect(formatRelative(old)).toBe(formatDate(old));
  });

  it('renders notification times as clock, yesterday, then absolute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T03:00:00Z')); // 10.00 WIB
    try {
      const todayTenOclock = new Date('2026-08-05T00:00:00Z'); // 07.00 WIB
      expect(formatNotificationTime(todayTenOclock)).toBe('07.00');

      const yesterdayEvening = new Date('2026-08-04T08:45:00Z'); // 15.45 WIB
      expect(formatNotificationTime(yesterdayEvening)).toBe('Kemarin, 15.45');

      const older = new Date('2026-08-02T02:10:00Z'); // 09.10 WIB
      expect(formatNotificationTime(older)).toContain('09.10');
      expect(formatNotificationTime(older)).toContain('2026');

      expect(formatNotificationTime(null)).toBe('—');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('media urls', () => {
  it('builds an authorized media URL', () => {
    expect(mediaUrl('abc-123')).toBe('/api/v1/media/abc-123');
  });
});

describe('closure review status display', () => {
  it('folds a pending or accepted review into the closed label', () => {
    expect(voiceStatusDisplay('CLOSED', 'PENDING')).toBe('Menunggu Penilaian');
    expect(voiceStatusDisplay('CLOSED', 'ACCEPTED')).toBe('Diterima');
    expect(voiceStatusDisplay('CLOSED', null)).toBe('Selesai');
  });

  it('shows a rejected cycle as reopened during re-verification', () => {
    expect(voiceStatusDisplay('IN_VERIFICATION', 'REJECTED')).toBe('Dibuka Kembali');
    // A rejected review only colors the re-verification phase, never a plain
    // verification or the accepted closure.
    expect(voiceStatusDisplay('IN_VERIFICATION', null)).toBe('Verifikasi');
    expect(voiceStatusDisplay('IN_PROGRESS', 'REJECTED')).toBe('Diproses');
  });

  it('leaves non-closure statuses untouched', () => {
    expect(voiceStatusDisplay('OPEN')).toBe('Terbuka');
    expect(voiceStatusDisplay('IN_PROGRESS', 'PENDING')).toBe('Diproses');
  });
});

describe('closure review countdown', () => {
  it('returns em-dash without a deadline', () => {
    expect(formatRemaining(null)).toBe('—');
    expect(formatRemaining(undefined)).toBe('—');
    expect(formatRemaining('not-a-date')).toBe('—');
  });

  it('marks a passed deadline as elapsed', () => {
    expect(formatRemaining(new Date(Date.now() - 60_000))).toBe('terlewati');
  });

  it('buckets the remaining window into minutes, hours, and days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T03:00:00Z'));
    try {
      expect(formatRemaining(new Date('2026-08-05T03:30:00Z'))).toBe('30 menit lagi');
      expect(formatRemaining(new Date('2026-08-05T08:00:00Z'))).toBe('5 jam lagi');
      expect(formatRemaining(new Date('2026-08-07T03:00:00Z'))).toBe('2 hari lagi');
    } finally {
      vi.useRealTimers();
    }
  });
});
