import { VoiceStatus } from '@prisma/client';

export type VoiceAction = 'RESPOND' | 'ASSIGN' | 'REASSIGN' | 'PROCEED' | 'CLOSE' | 'REOPEN';
export function transitionTarget(status: VoiceStatus, action: VoiceAction): VoiceStatus | null {
  if (status === VoiceStatus.OPEN && (action === 'RESPOND' || action === 'ASSIGN'))
    return VoiceStatus.RESPONDED;
  if (status === VoiceStatus.RESPONDED && (action === 'ASSIGN' || action === 'REASSIGN'))
    return VoiceStatus.RESPONDED;
  if (status === VoiceStatus.RESPONDED && action === 'PROCEED') return VoiceStatus.IN_PROGRESS;
  if (status === VoiceStatus.IN_PROGRESS && action === 'CLOSE') return VoiceStatus.CLOSED;
  if (status === VoiceStatus.CLOSED && action === 'REOPEN') return VoiceStatus.IN_PROGRESS;
  return null;
}

/**
 * Rating policy for a closure cycle. `reopenAllowed` is false once the review
 * window has passed: a late rating is still recorded, but it can no longer
 * reopen the voice.
 */
export function ratingError(
  score: number,
  feedback: string | undefined,
  reopen: boolean,
  reopenAllowed: boolean,
): string | null {
  if (score < 1 || score > 5 || !Number.isInteger(score)) return 'RATING_INVALID';
  if (score <= 2 && !feedback?.trim()) return 'FEEDBACK_REQUIRED';
  if (reopen && (score >= 3 || !reopenAllowed)) return 'REOPEN_NOT_ALLOWED';
  return null;
}
