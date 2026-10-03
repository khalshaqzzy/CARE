import { describe, expect, it } from 'vitest';
import { nextTierLevel } from '../../src/voices/tier-chain';

describe('tier chain', () => {
  it('moves to the next level recorded at submit', () => {
    const path = ['GROUP_LEADER', 'MANAGER', 'DIVISION'] as const;
    expect(nextTierLevel([...path], 'GROUP_LEADER')).toBe('MANAGER');
    expect(nextTierLevel([...path], 'MANAGER')).toBe('DIVISION');
    expect(nextTierLevel([...path], 'DIVISION')).toBeNull();
    expect(nextTierLevel([...path], null)).toBeNull();
  });
});
