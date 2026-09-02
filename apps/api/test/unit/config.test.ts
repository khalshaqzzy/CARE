import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, redactedConfig, resetConfigForTests } from '../../src/config';

describe('runtime configuration', () => {
  afterEach(() => {
    delete process.env.OPENAI_REASONING_EFFORT;
    delete process.env.OPENAI_TIMEOUT_MS;
    delete process.env.CLOSURE_REVIEW_DAYS;
    process.env.SESSION_HASH_SECRET = 'test-session-hash-secret-000000000000';
    process.env.SESSION_CSRF_SECRET = 'test-session-csrf-secret-000000000000';
    process.env.AUTH_THROTTLE_SECRET = 'test-auth-throttle-secret-00000000000';
    process.env.CURSOR_SIGNING_SECRET = 'test-cursor-signing-secret-0000000000';
    process.env.OPENAI_CONFIG_ENCRYPTION_KEY = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    resetConfigForTests();
  });
  it('parses an exact trusted proxy hop count', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      TRUST_PROXY_HOPS: '1',
    });
    expect(loadConfig().TRUST_PROXY_HOPS).toBe(1);
  });
  it('defaults the closure review window to two days and bounds it', () => {
    const base = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
    };
    Object.assign(process.env, base);
    expect(loadConfig().CLOSURE_REVIEW_DAYS).toBe(2);
    resetConfigForTests();
    Object.assign(process.env, base, { CLOSURE_REVIEW_DAYS: '7' });
    expect(loadConfig().CLOSURE_REVIEW_DAYS).toBe(7);
    resetConfigForTests();
    Object.assign(process.env, base, { CLOSURE_REVIEW_DAYS: '0' });
    expect(() => loadConfig()).toThrow();
  });
  it('never exposes runtime secrets', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      OPENAI_API_KEY: 'secret-api-key-value-that-is-long',
      OPENAI_MODEL: 'test-model',
      OPENAI_BASE_URL: 'https://example.invalid/v1',
    });
    const value = JSON.stringify(redactedConfig(loadConfig()));
    expect(value).not.toContain('secret-api-key');
    expect(value).toContain('"configured":true');
  });
  it('preserves provider-default empty reasoning effort and a supported override', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      OPENAI_REASONING_EFFORT: '',
    });
    expect(loadConfig().OPENAI_REASONING_EFFORT).toBe('');

    resetConfigForTests();
    process.env.OPENAI_REASONING_EFFORT = 'high';
    expect(loadConfig().OPENAI_REASONING_EFFORT).toBe('high');

    resetConfigForTests();
    process.env.OPENAI_REASONING_EFFORT = 'extreme';
    expect(() => loadConfig()).toThrow('OPENAI_REASONING_EFFORT');
  });
  it('defaults the provider attempt timeout to 60 seconds and enforces its ceiling', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
    });
    expect(loadConfig().OPENAI_TIMEOUT_MS).toBe(60_000);

    resetConfigForTests();
    process.env.OPENAI_TIMEOUT_MS = '60001';
    expect(() => loadConfig()).toThrow('OPENAI_TIMEOUT_MS');
  });
  it('rejects reuse of a session secret for AI configuration encryption', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'e'.repeat(43),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      OPENAI_CONFIG_ENCRYPTION_KEY: 'e'.repeat(43),
    });
    resetConfigForTests();
    expect(() => loadConfig()).toThrow('must be distinct');
  });
});
