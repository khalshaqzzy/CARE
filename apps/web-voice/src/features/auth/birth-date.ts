/** Days the picked month can hold; without a year February allows the 29th. */
export function daysInMonth(month: string, year: string) {
  if (!month) return 31;
  return new Date(year ? Number(year) : 2000, Number(month), 0).getDate();
}

/** Keeps a picked day unless the new month or year cannot hold it. */
export function keepDay(day: string, month: string, year: string) {
  return day && Number(day) > daysInMonth(month, year) ? '' : day;
}
