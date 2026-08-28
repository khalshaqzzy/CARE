import type { HandlerType, VoiceStatus, VoiceVisibility } from '@prisma/client';

export type ActionableVoice = {
  reporterId: string;
  routeOwnerId: string;
  currentHandlerId: string | null;
  visibility: VoiceVisibility;
  status: VoiceStatus;
  handlerType: HandlerType;
  closureCycles?: Array<{ reopenedAt: Date | null; rating?: { score: number } | null }>;
};

export type ActionActor = {
  accountId: string;
  capabilities: string[];
};

/**
 * Computes the server-authoritative set of lifecycle actions an actor may
 * currently perform on a voice. This is a pure decision function so the
 * frontend only uses it to render affordances; every mutation is still
 * authorized and version-checked on the backend.
 */
export function computeAvailableActions(actor: ActionActor, voice: ActionableVoice): string[] {
  const isReporter = voice.reporterId === actor.accountId;
  const isRouteOwner = voice.routeOwnerId === actor.accountId;
  const isHandler = voice.currentHandlerId === actor.accountId;
  const isPrivate = voice.visibility === 'PRIVATE';
  const canAssign = !isPrivate
    ? actor.capabilities.includes('MANAGER') && isRouteOwner
    : actor.capabilities.includes('UNION_HEAD');
  const canOperate =
    !isReporter &&
    (isPrivate
      ? actor.capabilities.includes('UNION_HEAD') || isHandler
      : isRouteOwner || isHandler);
  const actions: string[] = [];
  if (canOperate) {
    if (voice.status === 'OPEN') {
      actions.push('ASK', 'PROCEED', 'MESSAGE');
      if (canAssign) actions.push('ASSIGN');
    } else if (voice.status === 'IN_VERIFICATION') {
      actions.push('ASK', 'MESSAGE', 'PROCEED');
      if (canAssign) actions.push('REASSIGN');
    } else if (voice.status === 'IN_PROGRESS') {
      actions.push('CLOSE', 'MESSAGE');
    }
  } else if (isReporter) {
    if (voice.status !== 'CLOSED') actions.push('MESSAGE');
    else {
      const latest = voice.closureCycles?.at(-1);
      if (latest && !latest.reopenedAt) {
        actions.push('RATE');
        if (latest.rating?.score && latest.rating.score <= 2) actions.push('REOPEN');
      }
    }
  }
  return actions;
}
