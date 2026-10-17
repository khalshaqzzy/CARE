import type { Prisma, PrismaClient, Severity, TierLevel } from '@prisma/client';
import { addWorkingTime } from '../escalation/working-time';
import { workingCalendar } from '../escalation/tier-window';
import { closerLevel, needsClosureApproval } from './actions';
import { chainForVoice, TIER_ORDER, type TierStep } from './tier-chain';

type Db = PrismaClient | Prisma.TransactionClient;

/** Each approval level has two working days. */
export const APPROVAL_WORKING_DAYS = 2;

type VoiceForApproval = Parameters<typeof chainForVoice>[1] & {
  severity: Severity;
  tierPath: TierLevel[];
};

/**
 * The levels above the PIC up to the closing level, from the same chain as
 * tiered routing. Fixed categories are handled in the handling department, so
 * only its Manager and Deputy/Division Heads approve. Empty levels are skipped
 * and the PIC never approves their own report.
 */
export async function approvalSteps(
  db: Db,
  voice: VoiceForApproval,
  picId: string,
  picLevel: TierLevel | null,
): Promise<TierStep[]> {
  const closer = closerLevel(voice.severity);
  if (!closer || !needsClosureApproval(voice.severity, picLevel)) return [];
  const from = picLevel ? TIER_ORDER.indexOf(picLevel) : -1;
  const to = TIER_ORDER.indexOf(closer);
  const tiered = voice.tierPath.length > 0;
  return (await chainForVoice(db, voice))
    .filter((step) => {
      const index = TIER_ORDER.indexOf(step.level);
      if (index <= from || index > to) return false;
      return tiered || step.level === 'MANAGER' || step.level === 'DIVISION';
    })
    .map((step) => ({ ...step, accountIds: step.accountIds.filter((id) => id !== picId) }))
    .filter((step) => step.accountIds.length > 0);
}

/** The end of an approval level's window: two working days on the Admin calendar. */
export async function approvalDueAt(db: Db, from = new Date()) {
  return addWorkingTime(from, APPROVAL_WORKING_DAYS, 'WORKING_DAY', await workingCalendar(db));
}
