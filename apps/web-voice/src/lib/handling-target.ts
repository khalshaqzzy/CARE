export function previewHandlingTarget(days: number, now = new Date()): Date {
  const jakarta = new Date(now.getTime() + 7 * 3600000);
  return new Date(
    Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() + days + 1) -
      7 * 3600000 -
      1,
  );
}
export function formatTargetDate(value: string | Date): string {
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)) + ' WIB'
  );
}
export function clipParticipantName(name: string): string {
  const chars = Array.from(name);
  return chars.length > 12 ? chars.slice(0, 11).join('') + '…' : name;
}
