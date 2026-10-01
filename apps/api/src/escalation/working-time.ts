// Working-time arithmetic for escalation deadlines. All calendar decisions use
// Asia/Jakarta (UTC+7, no daylight saving).

export type EscalationUnit = 'WORKING_DAY' | 'CALENDAR_HOUR';
export type WorkingCalendar = {
  useStandard: boolean;
  /** `YYYY-MM-DD` (WIB) → override; ignored when `useStandard` is true. */
  exceptions: ReadonlyMap<string, 'HOLIDAY' | 'WORKDAY'>;
};

const OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
/** Safety bound when searching for the next working day. */
const MAX_SEARCH_DAYS = 366;

/** WIB calendar date of an instant as `YYYY-MM-DD`. */
export function jakartaDateKey(instant: Date) {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function isWorkingDay(dateKey: string, calendar: WorkingCalendar) {
  const override = calendar.useStandard ? undefined : calendar.exceptions.get(dateKey);
  if (override) return override === 'WORKDAY';
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

const shiftKey = (dateKey: string, days: number) =>
  new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function nextWorkingDay(dateKey: string, calendar: WorkingCalendar) {
  let key = dateKey;
  for (let i = 0; i < MAX_SEARCH_DAYS; i += 1) {
    key = shiftKey(key, 1);
    if (isWorkingDay(key, calendar)) return key;
  }
  throw new Error('No working day within a year; check the working calendar');
}

/**
 * Deadline after `amount` units from `start`.
 * - Calendar hours run around the clock.
 * - Working days keep the WIB time of day and skip non-working days. A start
 *   on a non-working day counts from 00.00 WIB of the next working day, so a
 *   Saturday report with one working day is due Tuesday 00.00 (all of Monday).
 */
export function addWorkingTime(
  start: Date,
  amount: number,
  unit: EscalationUnit,
  calendar: WorkingCalendar,
): Date {
  if (!Number.isInteger(amount) || amount < 1) throw new Error('amount must be a positive integer');
  if (unit === 'CALENDAR_HOUR') return new Date(start.getTime() + amount * 3_600_000);
  let dateKey = jakartaDateKey(start);
  let timeOfDay = (start.getTime() + OFFSET_MS) % DAY_MS;
  if (!isWorkingDay(dateKey, calendar)) {
    dateKey = nextWorkingDay(dateKey, calendar);
    timeOfDay = 0;
  }
  for (let i = 0; i < amount; i += 1) dateKey = nextWorkingDay(dateKey, calendar);
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - OFFSET_MS + timeOfDay);
}
