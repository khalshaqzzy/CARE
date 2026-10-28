import { describe, expect, it } from 'vitest';
import { installLanguage } from './install-copy';

describe('installLanguage', () => {
  it('uses Indonesian for Indonesian phones, including the legacy `in` code', () => {
    expect(installLanguage(['id-ID', 'en-US'])).toBe('id');
    expect(installLanguage(['in-ID'])).toBe('id');
    expect(installLanguage(undefined, 'id')).toBe('id');
  });

  it('falls back to English for every other language', () => {
    expect(installLanguage(['en-US', 'id-ID'])).toBe('en');
    expect(installLanguage(['ja-JP'])).toBe('en');
    expect(installLanguage([], '')).toBe('en');
  });
});
