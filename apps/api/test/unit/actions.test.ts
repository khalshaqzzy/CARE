import { describe, expect, it } from 'vitest';
import type { HandlerType, VoiceStatus, VoiceVisibility } from '@prisma/client';
import {
  computeAvailableActions,
  type ActionActor,
  type ActionableVoice,
} from '../../src/voices/actions';

function actor(capabilities: string[], accountId = 'actor'): ActionActor {
  return { accountId, capabilities };
}

function voice(overrides: Partial<ActionableVoice> = {}): ActionableVoice {
  return {
    reporterId: 'reporter',
    routeOwnerId: 'owner',
    currentHandlerId: null,
    visibility: 'GENERAL',
    status: 'OPEN',
    handlerType: 'MANAGER',
    closureCycles: [],
    ...overrides,
  };
}

describe('computeAvailableActions', () => {
  it('gives a route owner ask/proceed on OPEN General', () => {
    const result = computeAvailableActions(actor(['MANAGER'], 'owner'), voice());
    expect(result).toContain('ASK');
    expect(result).toContain('PROCEED');
    expect(result).toContain('MESSAGE');
    expect(result).toContain('ASSIGN');
  });

  it('offers reassign only in IN_VERIFICATION for a managing route owner', () => {
    const result = computeAvailableActions(
      actor(['MANAGER'], 'owner'),
      voice({ status: 'IN_VERIFICATION' as VoiceStatus }),
    );
    expect(result).toContain('REASSIGN');
    expect(result).toContain('PROCEED');
    expect(result).not.toContain('ASSIGN');
  });

  it('offers close only from IN_PROGRESS', () => {
    const result = computeAvailableActions(
      actor(['MANAGER'], 'owner'),
      voice({ status: 'IN_PROGRESS' as VoiceStatus }),
    );
    expect(result).toContain('CLOSE');
    expect(result).not.toContain('PROCEED');
  });

  it('denies action to a manager who is not route owner or handler', () => {
    const result = computeAvailableActions(actor(['MANAGER'], 'stranger'), voice());
    expect(result).toEqual([]);
  });

  it('gives the reporter message on active voices, and rate/reopen on closed', () => {
    const replyer = actor(['MEMBER'], 'reporter');
    const closed = computeAvailableActions(
      replyer,
      voice({
        status: 'CLOSED' as VoiceStatus,
        reporterId: 'reporter',
        closureCycles: [{ reopenedAt: null, rating: { score: 2 } }],
      }),
    );
    expect(closed).toContain('RATE');
    expect(closed).toContain('REOPEN');
    const open = computeAvailableActions(replyer, voice({ reporterId: 'reporter' }));
    expect(open).toContain('MESSAGE');
  });

  it('does not offer reopen for a high rating', () => {
    const result = computeAvailableActions(
      actor(['MEMBER'], 'reporter'),
      voice({
        status: 'CLOSED' as VoiceStatus,
        reporterId: 'reporter',
        closureCycles: [{ reopenedAt: null, rating: { score: 4 } }],
      }),
    );
    expect(result).toContain('RATE');
    expect(result).not.toContain('REOPEN');
  });

  it('allows Union Head to operate on all Private and assign officers', () => {
    const result = computeAvailableActions(
      actor(['UNION_HEAD'], 'unionHead'),
      voice({
        visibility: 'PRIVATE' as VoiceVisibility,
        routeOwnerId: 'unionHead',
        handlerType: 'UNION_HEAD' as HandlerType,
      }),
    );
    expect(result).toContain('ASSIGN');
    expect(result).toContain('ASK');
  });

  it('does not expose assign control to a Section Head', () => {
    const result = computeAvailableActions(
      actor(['SECTION_HEAD', 'MEMBER'], 'handler'),
      voice({
        status: 'OPEN' as VoiceStatus,
        currentHandlerId: 'handler',
      }),
    );
    expect(result).toContain('ASK');
    expect(result).not.toContain('ASSIGN');
  });

  it('returns no actions on CLOSED for a handler', () => {
    const result = computeAvailableActions(
      actor(['MANAGER'], 'owner'),
      voice({ status: 'CLOSED' as VoiceStatus }),
    );
    expect(result).toEqual([]);
  });
});
