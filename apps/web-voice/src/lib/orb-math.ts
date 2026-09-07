/**
 * Dot-matrix orb geometry and opacity math for the Create Voice processing
 * card. A square grid masked to a circle, where each dot's opacity follows a
 * five-petal bloom wave blended with a radial ring wave and a diagonal chord
 * wave. The `progress` input lifts dots toward full brightness from the
 * center outward so the orb visually settles as the analysis stages complete.
 */

export const ORB_SIZE = 9;
export const ORB_BASE_OPACITY = 0.16;
export const ORB_GATE_OPACITY = 0.95;
export const ORB_CYCLE_MS = 1600;
export const ORB_SETTLE_BAND = 1.25;

export type OrbDotInput = {
  row: number;
  col: number;
  size?: number;
  /** Phase within the bloom cycle, 0..1. */
  phase: number;
  /** Completed analysis stages, 0..1. */
  progress: number;
};

export function isWithinCircularMask(row: number, col: number, size: number = ORB_SIZE): boolean {
  const center = (size - 1) / 2;
  const x = col - center;
  const y = row - center;
  return Math.sqrt(x * x + y * y) <= center + 0.5;
}

function smoothstep(edge: number): number {
  const clamped = Math.min(1, Math.max(0, edge));
  return clamped * clamped * (3 - 2 * clamped);
}

export function computeOrbOpacity({
  row,
  col,
  size = ORB_SIZE,
  phase,
  progress,
}: OrbDotInput): number {
  const center = (size - 1) / 2;
  const x = col - center;
  const y = row - center;
  const t = phase * Math.PI * 2;
  const ring = Math.sqrt(x * x + y * y);
  const angle = Math.atan2(y, x);
  const petalWave = 0.5 + 0.5 * Math.cos(5 * angle - t * 1.7);
  const ringWave = 0.5 + 0.5 * Math.cos(ring * 3.3 - t * 1.2);
  const chordWave = 0.5 + 0.5 * Math.cos((x + y) * 1.6 + t * 1.35);
  const petalGate = Math.pow(petalWave, 2.2);
  const blend = 0.68 * petalGate + 0.22 * ringWave + 0.1 * chordWave;
  const wave = ORB_BASE_OPACITY + (ORB_GATE_OPACITY - ORB_BASE_OPACITY) * blend;

  // Completed stages lock their dots bright from the center outward while the
  // outer frontier keeps blooming; the band lets progress 1 settle the rim.
  const maskRadius = center + 0.25;
  const settled = smoothstep(progress * (maskRadius + ORB_SETTLE_BAND) - ring);
  return Math.max(wave, settled * ORB_GATE_OPACITY);
}
