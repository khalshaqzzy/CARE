import { describe, expect, it } from 'vitest';
import { handlingDueAt, handlingTargetState } from '../../src/voices/handling-target';

describe('Jakarta calendar target', () => {
  it.each([
    ['2026-09-21T16:59:00Z', 0, '2026-09-21T16:59:59.999Z'],
    ['2026-09-21T17:00:00Z', 0, '2026-09-22T16:59:59.999Z'],
    ['2026-12-31T12:00:00Z', 1, '2027-01-01T16:59:59.999Z'],
    ['2028-02-28T12:00:00Z', 1, '2028-02-29T16:59:59.999Z'],
  ])('%s + %s days ends at %s', (start, days, expected) => {
    expect(handlingDueAt(new Date(start), days).toISOString()).toBe(expected);
  });
  it('uses closure time rather than current time for completed commitments', () => {
    const due = new Date('2026-09-21T16:59:59.999Z');
    expect(handlingTargetState(due, due)).toBe('COMPLETED_ON_TIME');
    expect(handlingTargetState(due, new Date(due.getTime() + 1))).toBe('COMPLETED_LATE');
    expect(handlingTargetState(due, null, new Date(due.getTime() + 1))).toBe('OVERDUE');
    expect(handlingTargetState(due, null, due)).toBe('ON_TRACK');
  });
});
