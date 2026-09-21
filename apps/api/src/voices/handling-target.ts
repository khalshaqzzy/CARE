/** Jakarta has no DST. Days are calendar offsets, ending at 23:59:59.999 WIB. */
export function handlingDueAt(now: Date, days: number): Date {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() + days + 1) -
      7 * 60 * 60 * 1000 -
      1,
  );
}
export function formatHandlingDueAt(date: Date): string {
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date) + ' WIB'
  );
}
export function handlingTargetState(dueAt: Date, closedAt: Date | null, now = new Date()) {
  if (closedAt) return closedAt <= dueAt ? 'COMPLETED_ON_TIME' : 'COMPLETED_LATE';
  return now > dueAt ? 'OVERDUE' : 'ON_TRACK';
}
