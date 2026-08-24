import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, redactedConfig, resetConfigForTests } from '../../src/config';

describe('runtime configuration', () => {
  afterEach(() => resetConfigForTests());
  it('never exposes runtime secrets', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      SESSION_HASH_SECRET: 'a'.repeat(32),
      SESSION_CSRF_SECRET: 'b'.repeat(32),
      AUTH_THROTTLE_SECRET: 'c'.repeat(32),
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      VERTEX_API_KEY: 'secret-api-key-value-that-is-long',
    });
    const value = JSON.stringify(redactedConfig(loadConfig()));
    expect(value).not.toContain('secret-api-key');
    expect(value).toContain('"configured":true');
  });
});
