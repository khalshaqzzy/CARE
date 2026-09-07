import type { HandlerType, VoiceStatus, VoiceVisibility } from '@prisma/client';

export type ActionableVoice = {
  reporterId: string;
  routeOwnerId: string;
  currentHandlerId: string | null;
  visibility: VoiceVisibility;
  status: VoiceStatus;
  handlerType: HandlerType;
  hasConversation?: boolean;
  closureCycles?: Array<{
    reopenedAt: Date | null;
    reviewState?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    rating?: { score: number } | null;
  }>;
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
      actions.push('ASK', 'PROCEED');
      if (canAssign) actions.push('ASSIGN');
      if (!isPrivate && actor.capabilities.includes('MANAGER') && isRouteOwner)
        actions.push('HANDOVER');
    } else if (voice.status === 'IN_VERIFICATION') {
      actions.push('ASK', 'MESSAGE', 'PROCEED');
      if (canAssign) actions.push('REASSIGN');
    } else if (voice.status === 'IN_PROGRESS') {
      actions.push('CLOSE');
      if (voice.hasConversation) actions.push('MESSAGE');
    }
  } else if (isReporter) {
    if (voice.status === 'IN_VERIFICATION') actions.push('MESSAGE');
    else if (voice.status === 'IN_PROGRESS' && voice.hasConversation) actions.push('MESSAGE');
    else if (voice.status === 'CLOSED') {
      const latest = voice.closureCycles?.at(-1);
      if (latest && !latest.reopenedAt && !latest.rating) actions.push('RATE');
    }
  }
  return actions;
}
