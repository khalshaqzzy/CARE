import { afterEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config';
import {
  decryptAiSecret,
  encryptAiSecret,
  fingerprintAiSecret,
} from '../../src/ai/runtime-config.service';

describe('AI runtime configuration encryption', () => {
  const original = process.env.OPENAI_CONFIG_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.OPENAI_CONFIG_ENCRYPTION_KEY = original;
    resetConfigForTests();
  });

  it('round-trips AES-256-GCM secrets without storing plaintext', () => {
    process.env.OPENAI_CONFIG_ENCRYPTION_KEY = 'k'.repeat(43);
    resetConfigForTests();
    const value = 'provider-secret-that-must-not-be-persisted';
    const encrypted = encryptAiSecret(value);
    expect(JSON.stringify(encrypted)).not.toContain(value);
    expect(decryptAiSecret(encrypted)).toBe(value);
  });

  it('detects tampering and fails when the encryption key is missing', () => {
    process.env.OPENAI_CONFIG_ENCRYPTION_KEY = 'm'.repeat(43);
    resetConfigForTests();
    const encrypted = encryptAiSecret('provider-secret-that-is-long-enough');
    expect(() => decryptAiSecret({ ...encrypted, tag: 'A'.repeat(22) })).toThrow();

    delete process.env.OPENAI_CONFIG_ENCRYPTION_KEY;
    resetConfigForTests();
    expect(() => encryptAiSecret('provider-secret-that-is-long-enough')).toThrow(
      'encryption key is unavailable',
    );
  });

  it('creates stable keyed fingerprints without storing the API key', () => {
    process.env.OPENAI_CONFIG_ENCRYPTION_KEY = 'k'.repeat(43);
    resetConfigForTests();
    const first = fingerprintAiSecret('provider-api-key-one');
    expect(first).toBe(fingerprintAiSecret('provider-api-key-one'));
    expect(first).not.toContain('provider-api-key-one');
    expect(first).not.toBe(fingerprintAiSecret('provider-api-key-two'));
  });
});
