import type { HandlerType, TierLevel, VoiceStatus, VoiceVisibility } from '@prisma/client';

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
  /** Tiered categories: the level holding the Voice and who may act on it. */
  tierLevel?: TierLevel | null;
  tierHolderIds?: string[];
  /** Levels found at submit; a holder may go up while a later level exists. */
  tierPath?: TierLevel[];
  /** Holders who answered before the Voice went up (the upper tier reminds them). */
  tierLowerHolderIds?: string[];
  sectionHasGroupLeader?: boolean;
  /** Former holders who raised the Voice by hand: they keep the chat only. */
  tierParticipantIds?: string[];
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
  // A tiered Voice is owned by its current holders; the route Manager acts
  // only once it reaches them (then they are the holder).
  const isRouteOwner = voice.tierLevel
    ? (voice.tierHolderIds ?? []).includes(actor.accountId)
    : voice.routeOwnerId === actor.accountId;
  const isHandler = voice.currentHandlerId === actor.accountId;
  const isPrivate = voice.visibility === 'PRIVATE';
  const tierLevel = voice.tierLevel ?? null;
  // The newest tier acts in full; holders below it keep Proses and the chat.
  const isTopHolder =
    !!tierLevel && isRouteOwner && !(voice.tierLowerHolderIds ?? []).includes(actor.accountId);
  const path = voice.tierPath ?? [];
  const hasNextTier = !!tierLevel && path.indexOf(tierLevel) + 1 < path.length;
  const canAssign = isPrivate
    ? actor.capabilities.includes('UNION_HEAD')
    : tierLevel
      ? isTopHolder &&
        (tierLevel === 'MANAGER' ||
          tierLevel === 'DIVISION' ||
          (tierLevel === 'SECTION_HEAD' && !!voice.sectionHasGroupLeader))
      : actor.capabilities.includes('MANAGER') && isRouteOwner;
  // Naikkan: only the newest tier, before anyone processes or is assigned.
  const canEscalate =
    isTopHolder &&
    hasNextTier &&
    !voice.currentHandlerId &&
    !(voice.tierLowerHolderIds ?? []).length;
  // Ingatkan: an upper tier nudges whoever answered or was assigned below it.
  const canRemind =
    isTopHolder &&
    ((voice.tierLowerHolderIds ?? []).length > 0 || (!!voice.currentHandlerId && !isHandler));
  const canOperate =
    !isReporter &&
    !actor.capabilities.includes('CARE_ADMIN') &&
    (isPrivate
      ? actor.capabilities.includes('UNION_HEAD') || isHandler
      : isRouteOwner || isHandler);
  // Only the route Manager hands a General Voice sideways, and only until
  // someone processes or is assigned it; a handover counts as the response.
  const canHandover =
    !isPrivate &&
    actor.capabilities.includes('MANAGER') &&
    isRouteOwner &&
    !voice.currentHandlerId &&
    (!voice.tierLevel || voice.tierLevel === 'MANAGER');
  const actions: string[] = [];
  if (canOperate) {
    if (voice.status === 'OPEN') {
      actions.push('RESPOND');
      if (canAssign) actions.push('ASSIGN');
      if (canHandover) actions.push('HANDOVER');
      if (canEscalate) actions.push('ESCALATE');
    } else if (voice.status === 'RESPONDED') {
      if (
        isHandler ||
        (!voice.currentHandlerId &&
          (isRouteOwner || (isPrivate && actor.capabilities.includes('UNION_HEAD'))))
      )
        actions.push('PROCEED');
      if (canAssign) actions.push(voice.currentHandlerId ? 'REASSIGN' : 'ASSIGN');
      if (canHandover) actions.push('HANDOVER');
      if (canEscalate) actions.push('ESCALATE');
      if (canRemind) actions.push('REMIND');
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
  } else if (
    (voice.tierParticipantIds ?? []).includes(actor.accountId) &&
    ['RESPONDED', 'IN_PROGRESS'].includes(voice.status) &&
    voice.hasConversation
  ) {
    actions.push('MESSAGE');
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
