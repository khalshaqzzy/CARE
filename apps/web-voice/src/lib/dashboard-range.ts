export type DashboardRange = '30d' | '90d' | 'year' | 'all' | 'custom';

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function dashboardDates(
  range: DashboardRange,
  customFrom?: string,
  customTo?: string,
  now = new Date(),
): { from?: string; to?: string } {
  if (range === 'all') return {};
  if (range === 'custom') {
    return {
      ...(customFrom ? { from: new Date(`${customFrom}T00:00:00`).toISOString() } : {}),
      ...(customTo ? { to: new Date(`${customTo}T23:59:59.999`).toISOString() } : {}),
    };
  }
  const from = startOfDay(now);
  if (range === 'year') from.setMonth(0, 1);
  else from.setDate(from.getDate() - (range === '90d' ? 89 : 29));
  return { from: from.toISOString(), to: now.toISOString() };
}
