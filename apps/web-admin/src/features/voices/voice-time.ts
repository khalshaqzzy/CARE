/**
 * Remaining time of the current step: the handling target while Diproses,
 * otherwise the response window of the level holding the Voice.
 */
export function remainingTime(
  voice: {
    status: string;
    targetDueAt?: string | null;
    tierDueAt?: string | null;
    specialHandling?: boolean;
  },
  now = Date.now(),
): { label: string; tone: 'danger' | 'warning' | 'neutral' | 'success' } {
  if (voice.status === 'CLOSED') return { label: 'Selesai', tone: 'success' };
  if (voice.specialHandling) return { label: 'Penanganan Khusus', tone: 'neutral' };
  const due = voice.status === 'IN_PROGRESS' ? voice.targetDueAt : voice.tierDueAt;
  if (!due) return { label: 'Tanpa batas', tone: 'neutral' };
  const diff = Date.parse(due) - now;
  const hours = Math.floor(Math.abs(diff) / 3_600_000);
  const days = Math.floor(hours / 24);
  const span = days
    ? `${days} hari${hours % 24 ? ` ${hours % 24} jam` : ''}`
    : `${Math.max(hours, 1)} jam`;
  if (diff < 0) return { label: `Terlambat ${span}`, tone: 'danger' };
  return { label: `Sisa ${span}`, tone: hours < 24 ? 'warning' : 'neutral' };
}
