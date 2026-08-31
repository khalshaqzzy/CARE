export const AREA_LABELS: Record<string, string> = {
  KARAWANG_1: 'Karawang 1',
  KARAWANG_2: 'Karawang 2',
  KARAWANG_3: 'Karawang 3',
  SUNTER_1: 'Sunter 1',
  SUNTER_2: 'Sunter 2',
};

export const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Terbuka',
  IN_VERIFICATION: 'Verifikasi',
  IN_PROGRESS: 'Diproses',
  CLOSED: 'Selesai',
};

export const CATEGORY_LABELS: Record<string, string> = {
  SAFETY: 'Keselamatan',
  ENVIRONMENT: 'Lingkungan',
  FACILITY: 'Fasilitas',
  WORK_DIFFICULTY: 'Kesulitan Kerja',
};

export const VISIBILITY_LABELS: Record<string, string> = {
  GENERAL: 'General',
  PRIVATE: 'Private',
};

export const CLASSIFICATION_LABELS: Record<string, string> = {
  AI: 'AI',
  MANUAL_FALLBACK: 'Manual',
};

export const ACTION_LABELS: Record<string, string> = {
  ASK: 'Tanya Reporter',
  PROCEED: 'Proses',
  ASSIGN: 'Tugaskan',
  REASSIGN: 'Alihkan',
  CLOSE: 'Tutup',
  MESSAGE: 'Kirim Pesan',
  RATE: 'Beri Rating',
  REOPEN: 'Buka Kembali',
};

export const VOICE_ACTION_LABELS: Record<string, string> = {
  SUBMITTED: 'Diajukan',
  ASKED_REPORTER: 'Menanyakan Reporter',
  MESSAGE_SENT: 'Pesan Terkirim',
  ASSIGNED: 'Ditugaskan',
  REASSIGNED: 'Dialihkan',
  PROCEEDED: 'Diproses',
  CLOSED: 'Ditutup',
  RATED: 'Dinilai',
  REOPENED: 'Dibuka Kembali',
};

const JAKARTA_TZ = 'Asia/Jakarta';
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  dateStyle: 'medium',
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} minggu lalu`;
  return formatDate(date);
}

/** Clock in Jakarta notation (07.00) for a notification row. */
function formatJakartaClock(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Compact notification timestamp: today shows the clock, yesterday prefixes
 * "Kemarin", everything older falls back to an absolute date + clock.
 */
export function formatNotificationTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const day = `${read('year')}-${read('month')}-${read('day')}`;
  const clock = formatJakartaClock(date);
  if (day === today) return clock;
  const yesterday = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - 24 * 60 * 60_000));
  if (day === yesterday) return `Kemarin, ${clock}`;
  return `${dateFormatter.format(date)}, ${clock}`;
}

export function mediaUrl(id: string): string {
  return `/api/v1/media/${id}`;
}

/** Compact axis label for trend charts: "6 Jul" from a YYYY-MM-DD bucket. */
export function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date);
}

export function severityRank(severity: string): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[severity] ?? 0;
}
