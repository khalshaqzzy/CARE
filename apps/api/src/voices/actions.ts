import type { HandlerType, VoiceStatus, VoiceVisibility } from '@prisma/client';

export type ActionableVoice = {
  reporterId: string;
  routeOwnerId: string;
  currentHandlerId: string | null;
  visibility: VoiceVisibility;
  status: VoiceStatus;
  handlerType: HandlerType;
  hasConversation?: boolean;
  hasHandlingTarget?: boolean;
  /** The current PIC account is no longer active (deactivated or legacy). */
  handlerInactive?: boolean;
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
    !actor.capabilities.includes('CARE_ADMIN') &&
    (isPrivate
      ? actor.capabilities.includes('UNION_HEAD') || isHandler
      : isRouteOwner || isHandler);
  const actions: string[] = [];
  if (canOperate) {
    if (voice.status === 'OPEN') {
      actions.push('RESPOND');
      if (canAssign) actions.push('ASSIGN');
      if (!isPrivate && actor.capabilities.includes('MANAGER') && isRouteOwner)
        actions.push('HANDOVER');
    } else if (voice.status === 'RESPONDED') {
      if (
        isHandler ||
        (!voice.currentHandlerId &&
          (isRouteOwner || (isPrivate && actor.capabilities.includes('UNION_HEAD'))))
      )
        actions.push('PROCEED');
      if (canAssign) actions.push(voice.currentHandlerId ? 'REASSIGN' : 'ASSIGN');
      if (voice.hasConversation) actions.push('MESSAGE');
    } else if (voice.status === 'IN_PROGRESS') {
      if (
        !voice.hasHandlingTarget &&
        (isHandler ||
          (!voice.currentHandlerId &&
            (isRouteOwner || (isPrivate && actor.capabilities.includes('UNION_HEAD')))))
      )
        actions.push('SET_TARGET');
      // Only the PIC who started handling closes the Voice. Older Voices that
      // never recorded a PIC stay closable by their route destination.
      if (
        isHandler ||
        (!voice.currentHandlerId &&
          (isRouteOwner || (isPrivate && actor.capabilities.includes('UNION_HEAD'))))
      )
        actions.push('CLOSE');
      if (voice.hasConversation) actions.push('MESSAGE');
    }
    // The superior who can assign may take over from a PIC whose account is no
    // longer active, so the Voice can still be completed.
    if (
      canAssign &&
      voice.currentHandlerId &&
      !isHandler &&
      voice.handlerInactive &&
      (voice.status === 'RESPONDED' || voice.status === 'IN_PROGRESS')
    )
      actions.push('TAKE_OVER');
  } else if (isReporter) {
    if (['RESPONDED', 'IN_PROGRESS'].includes(voice.status) && voice.hasConversation)
      actions.push('MESSAGE');
    else if (voice.status === 'CLOSED') {
      const latest = voice.closureCycles?.at(-1);
      if (latest && !latest.reopenedAt && !latest.rating) actions.push('RATE');
    }
  }
  return actions;
}
