import { describe, expect, it } from 'vitest';
import { computeOrbOpacity, isWithinCircularMask, ORB_GATE_OPACITY, ORB_SIZE } from './orb-math';

function visibleDots(size: number) {
  const dots: { row: number; col: number }[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isWithinCircularMask(row, col, size)) dots.push({ row, col });
    }
  }
  return dots;
}

describe('orb math', () => {
  it('masks the 9x9 grid to a 69-dot circle', () => {
    expect(ORB_SIZE).toBe(9);
    expect(visibleDots(ORB_SIZE)).toHaveLength(69);
    expect(isWithinCircularMask(0, 0)).toBe(false);
    expect(isWithinCircularMask(0, 1)).toBe(false);
    expect(isWithinCircularMask(0, 2)).toBe(true);
    expect(isWithinCircularMask(4, 4)).toBe(true);
  });

  it('keeps every animated dot within the base-to-gate opacity band', () => {
    for (const { row, col } of visibleDots(ORB_SIZE)) {
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        const opacity = computeOrbOpacity({ row, col, phase, progress: 0 });
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(ORB_GATE_OPACITY);
      }
    }
  });

  it('is deterministic for identical inputs', () => {
    const a = computeOrbOpacity({ row: 2, col: 5, phase: 0.4, progress: 1 / 3 });
    const b = computeOrbOpacity({ row: 2, col: 5, phase: 0.4, progress: 1 / 3 });
    expect(a).toBe(b);
  });

  it('brightens dots monotonically as stages complete', () => {
    for (const { row, col } of visibleDots(ORB_SIZE)) {
      let previous = -1;
      for (const progress of [0, 1 / 3, 2 / 3, 1]) {
        const opacity = computeOrbOpacity({ row, col, phase: 0, progress });
        expect(opacity).toBeGreaterThanOrEqual(previous);
        previous = opacity;
      }
      expect(previous).toBeCloseTo(ORB_GATE_OPACITY, 5);
    }
  });

  it('lifts the center earlier than the rim at partial progress', () => {
    const center = computeOrbOpacity({ row: 4, col: 4, phase: 0, progress: 1 / 3 });
    const rim = computeOrbOpacity({ row: 0, col: 4, phase: 0, progress: 1 / 3 });
    expect(center).toBeGreaterThan(rim);
  });
});
