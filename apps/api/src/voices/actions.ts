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
  /** The live cycle is Penanganan Khusus: no deadline, and the Voice cannot close yet. */
  specialHandling?: boolean;
  /** The current PIC account is no longer active (deactivated or legacy). */
  handlerInactive?: boolean;
  /** Tiered categories: the level holding the Voice and who may act on it. */
  tierLevel?: TierLevel | null;
  tierHolderIds?: string[];
  /** Levels found at submit; a holder may go up while a later level exists. */
  tierPath?: TierLevel[];
  /**
   * Holders the Voice went past when their window passed. They keep their
   * actions at their own level, and the upper tier reminds them.
   */
  tierLowerHolderIds?: string[];
  /** A holder at the current level has answered (not merely raised it). */
  tierHolderResponded?: boolean;
  sectionHasGroupLeader?: boolean;
  /** Former holders who raised the Voice by hand: they keep the chat only. */
  tierParticipantIds?: string[];
  /** Migrated from an earlier platform: its closure is final, so it is not rated. */
  migrated?: boolean;
  closureCycles?: Array<{
    reopenedAt: Date | null;
    reviewState?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    rating?: { score: number } | null;
  }>;
};

export type ActionActor = {
  accountId: string;
  capabilities: string[];
  /** Away leaders this actor substitutes for today. */
  actingFor?: string[];
};

/** The tier a leader holds by position (the highest one they carry). */
export function ownTierLevel(capabilities: string[]): TierLevel | null {
  if (capabilities.includes('DIVISION_LEADERSHIP')) return 'DIVISION';
  if (capabilities.includes('MANAGER')) return 'MANAGER';
  if (capabilities.includes('SECTION_HEAD')) return 'SECTION_HEAD';
  if (capabilities.includes('GROUP_LEADER')) return 'GROUP_LEADER';
  return null;
}

/**
 * The tier a holder acts at: the Voice's current tier for its newest holders,
 * and their own level for the holders it went past (who keep their actions).
 */
export function actingTierLevel(
  actor: ActionActor,
  voice: Pick<ActionableVoice, 'tierLevel' | 'tierLowerHolderIds'>,
): TierLevel | null {
  const ids = [actor.accountId, ...(actor.actingFor ?? [])];
  if ((voice.tierLowerHolderIds ?? []).some((id) => ids.includes(id)))
    return ownTierLevel(actor.capabilities) ?? voice.tierLevel ?? null;
  return voice.tierLevel ?? null;
}

/**
 * Computes the server-authoritative set of lifecycle actions an actor may
 * currently perform on a voice. This is a pure decision function so the
 * frontend only uses it to render affordances; every mutation is still
 * authorized and version-checked on the backend.
 */
export function computeAvailableActions(actor: ActionActor, voice: ActionableVoice): string[] {
  const isReporter = voice.reporterId === actor.accountId;
  // A substitute acts with the rights of the away leader.
  const ids = [actor.accountId, ...(actor.actingFor ?? [])];
  const isMe = (id: string | null | undefined) => !!id && ids.includes(id);
  // A tiered Voice is owned by its current holders; the route Manager acts
  // only once it reaches them (then they are the holder).
  const isRouteOwner = voice.tierLevel
    ? (voice.tierHolderIds ?? []).some(isMe)
    : isMe(voice.routeOwnerId);
  const isHandler = isMe(voice.currentHandlerId);
  const isPrivate = voice.visibility === 'PRIVATE';
  const tierLevel = voice.tierLevel ?? null;
  // The newest tier acts in full. The holders it went past (because their
  // window passed) keep acting at their own level, except Naikkan.
  const lowerIds = voice.tierLowerHolderIds ?? [];
  const isTopHolder = !!tierLevel && isRouteOwner && !lowerIds.some(isMe);
  const holdLevel = isRouteOwner ? actingTierLevel(actor, voice) : null;
  const path = voice.tierPath ?? [];
  const hasNextTier = !!tierLevel && path.indexOf(tierLevel) + 1 < path.length;
  // The Komite (Union Head account) handles Private Voices itself: no assignment.
  const canAssign = isPrivate
    ? false
    : tierLevel
      ? !!holdLevel &&
        (holdLevel === 'MANAGER' ||
          holdLevel === 'DIVISION' ||
          (holdLevel === 'SECTION_HEAD' && !!voice.sectionHasGroupLeader))
      : actor.capabilities.includes('MANAGER') && isRouteOwner;
  // Naikkan: only the newest tier, before anyone processes or is assigned, and
  // not once a level below has answered (the upper tier joined beside it).
  const canEscalate =
    isTopHolder &&
    hasNextTier &&
    !voice.currentHandlerId &&
    !(lowerIds.length && voice.tierHolderResponded);
  // Ingatkan: an upper tier nudges whoever answered or was assigned below it.
  const canRemind =
    isTopHolder &&
    ((voice.tierLowerHolderIds ?? []).length > 0 || (!!voice.currentHandlerId && !isHandler));
  const canOperate =
    !isReporter &&
    !actor.capabilities.some((c) => c === 'CARE_ADMIN' || c === 'DIVISION_ADMIN') &&
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
    // Severity stays editable, with a reason, until someone processes the Voice.
    const canChangeSeverity = voice.status === 'OPEN' || voice.status === 'RESPONDED';
    if (voice.status === 'OPEN') {
      actions.push('RESPOND');
      if (canAssign) actions.push('ASSIGN');
      if (canHandover) actions.push('HANDOVER');
      if (canEscalate) actions.push('ESCALATE');
      // The upper tier nudges the levels it went past, still unanswered.
      if (canRemind) actions.push('REMIND');
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
        (!voice.hasHandlingTarget || voice.specialHandling) &&
        (isHandler ||
          (!voice.currentHandlerId &&
            (isRouteOwner || (isPrivate && actor.capabilities.includes('UNION_HEAD')))))
      )
        actions.push('SET_TARGET');
      // Only the PIC who started handling closes the Voice. Older Voices that
      // never recorded a PIC stay closable by their route destination.
      if (
        !voice.specialHandling &&
        (isHandler ||
          (!voice.currentHandlerId &&
            (isRouteOwner || (isPrivate && actor.capabilities.includes('UNION_HEAD')))))
      )
        actions.push('CLOSE');
      if (voice.hasConversation) actions.push('MESSAGE');
    }
    if (canChangeSeverity) actions.push('CHANGE_SEVERITY');
    // The superior who can assign may take over from a PIC whose account is no
    // longer active, so the Voice can still be completed. The Komite takes back
    // Private Voices a deactivated Union Officer still holds.
    if (
      (canAssign || (isPrivate && actor.capabilities.includes('UNION_HEAD'))) &&
      voice.currentHandlerId &&
      !isHandler &&
      voice.handlerInactive &&
      (voice.status === 'RESPONDED' || voice.status === 'IN_PROGRESS')
    )
      actions.push('TAKE_OVER');
  } else if (
    (voice.tierParticipantIds ?? []).some(isMe) &&
    ['RESPONDED', 'IN_PROGRESS'].includes(voice.status) &&
    voice.hasConversation
  ) {
    actions.push('MESSAGE');
  } else if (isReporter) {
    if (['RESPONDED', 'IN_PROGRESS'].includes(voice.status) && voice.hasConversation)
      actions.push('MESSAGE');
    else if (voice.status === 'CLOSED') {
      const latest = voice.closureCycles?.at(-1);
      if (latest && !latest.reopenedAt && !latest.rating && !voice.migrated) actions.push('RATE');
    }
  }
  return actions;
}
