import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, redactedConfig, resetConfigForTests } from '../../src/config';

describe('runtime configuration', () => {
  afterEach(() => {
    delete process.env.OPENAI_REASONING_EFFORT;
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
  it('defaults an empty OpenAI reasoning effort to none and preserves a supported override', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      OPENAI_REASONING_EFFORT: '',
    });
    expect(loadConfig().OPENAI_REASONING_EFFORT).toBe('none');

    resetConfigForTests();
    process.env.OPENAI_REASONING_EFFORT = 'high';
    expect(loadConfig().OPENAI_REASONING_EFFORT).toBe('high');

    resetConfigForTests();
    process.env.OPENAI_REASONING_EFFORT = 'extreme';
    expect(() => loadConfig()).toThrow('OPENAI_REASONING_EFFORT');
  });
});
