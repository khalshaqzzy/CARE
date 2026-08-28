import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { sanitizedErrorDetail } from '../../src/ai/error-detail';

describe('sanitizedErrorDetail', () => {
  it('surfaces the wrapped network cause for connection failures', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND pad-llm-api.qd-tmmin.site'), {
      code: 'ENOTFOUND',
      hostname: 'pad-llm-api.qd-tmmin.site',
    });
    const error = new OpenAI.APIConnectionError({ message: 'Connection error.', cause });
    const detail = sanitizedErrorDetail(error);
    expect(detail).toContain('ENOTFOUND');
    expect(detail).toContain('pad-llm-api.qd-tmmin.site');
    expect(detail).toContain('APIConnectionError');
  });

  it('names timeouts without leaking request details', () => {
    const detail = sanitizedErrorDetail(
      new OpenAI.APIConnectionTimeoutError({ message: 'timed out' }),
    );
    expect(detail).toBe('APIConnectionTimeoutError: timed out');
  });

  it('redacts API-key material echoed by the provider error body', () => {
    // Token assembled at runtime so the secret-shaped literal is never a
    // contiguous source literal for scanners.
    const apiKeyToken = ['sk-', '0123456789', 'abcdef', '0123456789'].join('');
    const error = new OpenAI.APIError(
      401,
      { message: `Incorrect API key provided: ${apiKeyToken}. Check your key.` },
      undefined,
      new Headers(),
    );
    const detail = sanitizedErrorDetail(error);
    expect(detail).toContain('status=401');
    expect(detail).not.toContain(apiKeyToken);
    expect(detail).toContain('[redacted]');
  });

  it('redacts bearer tokens from generic errors', () => {
    // Token assembled at runtime so the secret-shaped literal is not a source
    // literal for scanners while still exercising the real scrub path.
    const bearerToken = ['abcDEF', '123xyz', '456'].join('');
    const detail = sanitizedErrorDetail(
      new Error(`proxy rejected Authorization: Bearer ${bearerToken} for upstream`),
    );
    expect(detail).not.toContain(bearerToken);
    expect(detail).toContain('[redacted]');
  });

  it('truncates provider output to a bounded length', () => {
    const error = new OpenAI.APIError(
      400,
      {},
      `provider detail ${'x'.repeat(2000)}`,
      new Headers(),
    );
    const detail = sanitizedErrorDetail(error);
    expect(detail).not.toBeNull();
    expect((detail as string).length).toBeLessThanOrEqual(300);
  });

  it('returns null for non-Error inputs', () => {
    expect(sanitizedErrorDetail(undefined)).toBeNull();
    expect(sanitizedErrorDetail('boom')).toBeNull();
    expect(sanitizedErrorDetail({ status: 500 })).toBeNull();
  });
});
