export type DashboardRange = '30d' | '90d' | 'year' | 'all' | 'custom';
const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;

export function isDashboardDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dashboardDates(
  range: DashboardRange,
  customFrom?: string,
  customTo?: string,
  now = new Date(),
): { from?: string; to?: string } {
  if (range === 'all') return {};
  if (range === 'custom') {
    if (
      (customFrom && !isDashboardDate(customFrom)) ||
      (customTo && !isDashboardDate(customTo)) ||
      (customFrom && customTo && customFrom > customTo)
    )
      throw new Error('Rentang tanggal dashboard tidak valid');
    return {
      ...(customFrom ? { from: new Date(`${customFrom}T00:00:00+07:00`).toISOString() } : {}),
      ...(customTo ? { to: new Date(`${customTo}T23:59:59.999+07:00`).toISOString() } : {}),
    };
  }

  const calendar = new Date(now.getTime() + JAKARTA_OFFSET);
  calendar.setUTCHours(0, 0, 0, 0);
  if (range === 'year') calendar.setUTCMonth(0, 1);
  else calendar.setUTCDate(calendar.getUTCDate() - (range === '90d' ? 89 : 29));
  return {
    from: new Date(calendar.getTime() - JAKARTA_OFFSET).toISOString(),
    to: now.toISOString(),
  };
}
