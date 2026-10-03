import type { Prisma, PrismaClient, Severity, TierDueKind } from '@prisma/client';
import { addWorkingTime, type WorkingCalendar } from './working-time';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * What the new holder owes:
 * - RESPOND: answer within the respond window;
 * - PROCESS: start handling within the process window (they answered);
 * - FULL: they received the Voice already answered (manual Naikkan,
 *   handover, assignment), so they get respond + process to start handling.
 */
export type WindowKind = 'RESPOND' | 'PROCESS' | 'FULL';

async function workingCalendar(db: Db): Promise<WorkingCalendar> {
  const setting = await db.workingCalendarSetting.findFirst();
  const exceptions = setting?.useStandard
    ? []
    : await db.workingCalendarException.findMany({ select: { date: true, kind: true } });
  return {
    useStandard: setting?.useStandard ?? true,
    exceptions: new Map(exceptions.map((row) => [row.date.toISOString().slice(0, 10), row.kind])),
  };
}

/** The window for the Voice's severity from the Admin deadline table; null if not configured. */
export async function tierWindow(
  db: Db,
  severity: Severity,
  kind: WindowKind,
  from = new Date(),
): Promise<{ tierDueAt: Date; tierDueKind: TierDueKind } | null> {
  const deadline = await db.escalationDeadline.findUnique({ where: { severity } });
  if (!deadline) return null;
  const amount =
    kind === 'RESPOND'
      ? deadline.respondAmount
      : kind === 'PROCESS'
        ? deadline.processAmount
        : deadline.respondAmount + deadline.processAmount;
  return {
    tierDueAt: addWorkingTime(from, amount, deadline.unit, await workingCalendar(db)),
    tierDueKind: kind === 'RESPOND' ? 'RESPOND' : 'PROCESS',
  };
}
