import { describe, expect, it } from 'vitest';
import { isTmNoReg, isValidPosition } from '../../src/voices/tm-position';

describe('TM position', () => {
  it('recognizes vocational registration numbers by the TM prefix', () => {
    expect(isTmNoReg('TM0001')).toBe(true);
    expect(isTmNoReg(' tm-12 ')).toBe(true);
    expect(isTmNoReg('700004')).toBe(false);
    expect(isTmNoReg('ATM01')).toBe(false);
  });

  it('accepts a listed Section with one of its Lines or no Line', () => {
    const sections = [
      { name: 'Line Sect', lines: ['Line A'] },
      { name: 'Office', lines: [] },
    ];
    expect(isValidPosition(sections, { section: 'Line Sect', line: 'Line A' })).toBe(true);
    expect(isValidPosition(sections, { section: 'Office', line: null })).toBe(true);
    expect(isValidPosition(sections, { section: 'Office', line: 'Line A' })).toBe(false);
    expect(isValidPosition(sections, { section: 'Gudang', line: null })).toBe(false);
  });
});
