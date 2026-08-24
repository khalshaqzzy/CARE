import { describe, expect, it } from 'vitest';
import { VoiceStatus } from '@prisma/client';
import { canonicalHash } from '../../src/common/crypto';
import { CLASSIFICATION_PROMPT_VERSION, CLASSIFICATION_SYSTEM_PROMPT } from '../../src/ai/prompt';
import { ratingError, transitionTarget } from '../../src/voices/policies';
import { decodeCursor, encodeCursor } from '../../src/common/cursor';
import { resetConfigForTests } from '../../src/config';
import { AiService } from '../../src/ai/ai.service';

describe('CARE domain contracts', () => {
  it('uses deterministic canonical request hashes', () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
  });
  it('signs opaque cursors and rejects tampering', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
    });
    resetConfigForTests();
    const cursor = encodeCursor('59e8ab6a-1608-4343-866e-e219b495507b');
    expect(cursor).not.toContain('59e8ab6a');
    expect(decodeCursor(cursor)).toBe('59e8ab6a-1608-4343-866e-e219b495507b');
    expect(() => decodeCursor(`${cursor}x`)).toThrowError(/Cursor is invalid/);
  });
  it('encodes all category and severity routing rules in the versioned Indonesian prompt', () => {
    expect(CLASSIFICATION_PROMPT_VERSION).toBe('care-id-v1');
    for (const value of [
      'SAFETY',
      'FACILITY',
      'WORK_DIFFICULTY',
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL',
      'harassment',
      'chemical spill',
    ])
      expect(CLASSIFICATION_SYSTEM_PROMPT).toContain(value);
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain('Jangan memilih');
  });
  it('requires manual fallback without exposing a missing provider secret', async () => {
    delete process.env.VERTEX_API_KEY;
    resetConfigForTests();
    const result = await new AiService().classify({
      area: 'KARAWANG_1',
      department: 'Production',
      title: 'Informasi',
      detail: 'Mohon tambahkan label yang lebih jelas.',
    });
    expect(result).toMatchObject({
      source: 'MANUAL_FALLBACK',
      fallbackCode: 'PROVIDER_NOT_CONFIGURED',
    });
    expect(JSON.stringify(result)).not.toContain('VERTEX_API_KEY');
  });
  it.each([
    [VoiceStatus.OPEN, 'ASK', VoiceStatus.IN_VERIFICATION],
    [VoiceStatus.OPEN, 'PROCEED', VoiceStatus.IN_PROGRESS],
    [VoiceStatus.IN_VERIFICATION, 'REASSIGN', VoiceStatus.IN_VERIFICATION],
    [VoiceStatus.IN_PROGRESS, 'CLOSE', VoiceStatus.CLOSED],
    [VoiceStatus.CLOSED, 'REOPEN', VoiceStatus.IN_VERIFICATION],
    [VoiceStatus.OPEN, 'CLOSE', null],
  ] as const)('enforces transition %s + %s', (status, action, target) => {
    expect(transitionTarget(status, action)).toBe(target);
  });
  it('enforces rating feedback and reopen rules', () => {
    expect(ratingError(1, undefined, false)).toBe('FEEDBACK_REQUIRED');
    expect(ratingError(2, 'belum selesai', true)).toBeNull();
    expect(ratingError(4, undefined, true)).toBe('REOPEN_NOT_ALLOWED');
    expect(ratingError(5, undefined, false)).toBeNull();
  });
});
