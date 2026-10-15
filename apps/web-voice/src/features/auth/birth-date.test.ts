import { describe, expect, it } from 'vitest';
import { daysInMonth, keepDay } from './birth-date';

describe('daysInMonth', () => {
  it('allows 31 days before a month is picked', () => {
    expect(daysInMonth('', '')).toBe(31);
    expect(daysInMonth('', '1990')).toBe(31);
  });
  it('follows the picked month and year', () => {
    expect(daysInMonth('04', '')).toBe(30);
    expect(daysInMonth('02', '')).toBe(29);
    expect(daysInMonth('02', '1990')).toBe(28);
    expect(daysInMonth('02', '1992')).toBe(29);
  });
});

describe('keepDay', () => {
  it('keeps the day when picking a month or year afterwards', () => {
    expect(keepDay('15', '08', '')).toBe('15');
    expect(keepDay('15', '08', '1990')).toBe('15');
    expect(keepDay('31', '01', '')).toBe('31');
  });
  it('clears only a day the new month or year cannot hold', () => {
    expect(keepDay('31', '04', '')).toBe('');
    expect(keepDay('30', '02', '')).toBe('');
    expect(keepDay('29', '02', '1992')).toBe('29');
    expect(keepDay('29', '02', '1990')).toBe('');
  });
  it('leaves an empty day empty', () => {
    expect(keepDay('', '02', '1990')).toBe('');
  });
});
