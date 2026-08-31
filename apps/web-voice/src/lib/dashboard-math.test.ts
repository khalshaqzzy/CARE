import { describe, expect, it } from 'vitest';
import {
  activeCount,
  bucketValue,
  donutSegments,
  statusDistribution,
  trendDeltaPercent,
  trendGeometry,
} from './dashboard-math';
import type { DistributionSlice, DonutSegment } from './dashboard-math';

const STATUS_BUCKETS = [
  { label: 'OPEN', value: 18 },
  { label: 'IN_VERIFICATION', value: 7 },
  { label: 'IN_PROGRESS', value: 9 },
  { label: 'CLOSED', value: 8 },
];

describe('dashboard-math', () => {
  it('reads bucket values with a zero fallback', () => {
    expect(bucketValue(STATUS_BUCKETS, 'OPEN')).toBe(18);
    expect(bucketValue(STATUS_BUCKETS, 'MISSING')).toBe(0);
    expect(bucketValue(undefined, 'OPEN')).toBe(0);
  });

  it('sums active statuses', () => {
    expect(activeCount(STATUS_BUCKETS)).toBe(34);
    expect(activeCount([{ label: 'CLOSED', value: 3 }])).toBe(0);
  });

  it('computes the trend delta and refuses undefined baselines', () => {
    expect(trendDeltaPercent(54, 50)).toBe(8);
    expect(trendDeltaPercent(45, 50)).toBe(-10);
    expect(trendDeltaPercent(50, 0)).toBeNull();
    expect(trendDeltaPercent(50, undefined)).toBeNull();
  });

  it('builds an ordered status distribution with whole percents', () => {
    const distribution: DistributionSlice[] = statusDistribution(STATUS_BUCKETS);
    expect(distribution.map((slice) => slice.label)).toEqual([
      'OPEN',
      'IN_VERIFICATION',
      'IN_PROGRESS',
      'CLOSED',
    ]);
    expect(distribution[0]).toMatchObject({ value: 18, percent: 43 });
    // Percentages are rounded independently, so they may drift from 100.
    expect(distribution.reduce((sum, slice) => sum + slice.percent, 0)).toBeLessThanOrEqual(101);
  });

  it('drops zero and suppressed buckets from the distribution', () => {
    const distribution: DistributionSlice[] = statusDistribution([
      { label: 'OPEN', value: 6 },
      { label: 'CLOSED', value: 0 },
      { label: 'OTHER_SUPPRESSED', value: 1 },
    ]);
    expect(distribution.map((slice) => slice.label)).toEqual(['OPEN']);
    expect(statusDistribution([])).toEqual([]);
  });

  it('maps donut fractions that sum to one', () => {
    const segments: DonutSegment[] = donutSegments(STATUS_BUCKETS);
    expect(segments).toHaveLength(4);
    const total = segments.reduce((sum, segment) => sum + segment.fraction, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(segments[0]).toMatchObject({ label: 'OPEN', value: 18 });
  });

  it('scales trend points into the viewBox with a nice y ceiling', () => {
    const { points, niceMax } = trendGeometry(
      [
        { label: '2026-07-06', value: 3 },
        { label: '2026-07-07', value: 9 },
      ],
      640,
      210,
      18,
    );
    expect(niceMax).toBe(10);
    expect(points[0].x).toBe(18);
    expect(points[1].x).toBe(640 - 18);
    expect(points[1].y).toBeLessThan(points[0].y);
  });

  it('centers a single trend point and keeps the ceiling positive', () => {
    const { points, niceMax } = trendGeometry([{ label: '2026-07-06', value: 0 }], 640, 210, 18);
    expect(niceMax).toBeGreaterThan(0);
    expect(points[0].x).toBe(320);
  });
});
