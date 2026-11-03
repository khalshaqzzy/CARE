import { describe, expect, it } from 'vitest';
import { prefersSourceChoice } from './PhotoSource';

const scope = (matches: boolean) => ({
  matchMedia: (query: string) =>
    ({ matches: query === '(pointer: coarse)' && matches }) as MediaQueryList,
});

describe('photo source choice', () => {
  it('asks touch devices to choose camera or gallery', () => {
    expect(prefersSourceChoice(scope(true))).toBe(true);
  });

  it('keeps the single file dialog for mouse devices', () => {
    expect(prefersSourceChoice(scope(false))).toBe(false);
  });

  it('falls back to the file dialog without matchMedia', () => {
    expect(prefersSourceChoice({})).toBe(false);
    expect(
      prefersSourceChoice({
        matchMedia: () => {
          throw new Error('unsupported');
        },
      }),
    ).toBe(false);
  });
});
