import { describe, expect, it } from 'vitest';
import { clipParticipantName, previewHandlingTarget, formatTargetDate } from './handling-target';
describe('handling presentation', () => {
  it('keeps up to twelve characters and includes ellipsis in the clipped limit', () => {
    expect(clipParticipantName('Budi Santoso')).toBe('Budi Santoso');
    expect(clipParticipantName('Muhammad Rizky Pratama')).toBe('Muhammad Ri…');
  });
  it('previews today using Jakarta rather than the browser timezone', () => {
    const date = previewHandlingTarget(0, new Date('2026-09-21T18:00:00Z'));
    expect(date.toISOString()).toBe('2026-09-22T16:59:59.999Z');
    expect(formatTargetDate(date)).toContain('WIB');
  });
});
