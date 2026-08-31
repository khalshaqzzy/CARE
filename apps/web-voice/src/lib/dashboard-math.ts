export type Bucket = { label: string; value: number };

/** Value of the first bucket whose label matches, or 0 when absent. */
export function bucketValue(buckets: Bucket[] | undefined, label: string): number {
  return buckets?.find((bucket) => bucket.label === label)?.value ?? 0;
}

/** Sum of OPEN + IN_VERIFICATION + IN_PROGRESS status buckets. */
export function activeCount(statusBuckets: Bucket[] | undefined): number {
  return (
    bucketValue(statusBuckets, 'OPEN') +
    bucketValue(statusBuckets, 'IN_VERIFICATION') +
    bucketValue(statusBuckets, 'IN_PROGRESS')
  );
}

/**
 * Percentage change of the current total against the previous-period total,
 * rounded to a whole percent; null when it cannot be expressed (no previous
 * data or a previous total of zero).
 */
export function trendDeltaPercent(currentTotal: number, previousTotal?: number): number | null {
  if (previousTotal === undefined || previousTotal <= 0 || currentTotal < 0) return null;
  return Math.round(((currentTotal - previousTotal) / previousTotal) * 100);
}

export type DistributionSlice = {
  label: string;
  value: number;
  /** Share of the total as a whole percent; legend shows "(n%)". */
  percent: number;
  color: string;
};

const STATUS_ORDER = ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'] as const;

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'var(--raw-brand-600)',
  IN_VERIFICATION: 'var(--raw-warning)',
  IN_PROGRESS: 'var(--raw-brand-400)',
  CLOSED: 'var(--raw-success)',
};

/**
 * Ordered status distribution with percentages for the stacked bar and donut.
 * Zero-value statuses are dropped so an empty aggregate renders an empty state
 * instead of a full-width invisible bar.
 */
export function statusDistribution(statusBuckets: Bucket[] | undefined): DistributionSlice[] {
  const total = activeCount(statusBuckets) + bucketValue(statusBuckets, 'CLOSED');
  if (total <= 0) return [];
  const present = (statusBuckets ?? [])
    .filter((bucket) => bucket.value > 0 && bucket.label !== 'OTHER_SUPPRESSED')
    .map((bucket) => bucket.label);
  const ordered = STATUS_ORDER.filter((status) => present.includes(status));
  return ordered.map((label) => {
    const value = bucketValue(statusBuckets, label);
    return {
      label,
      value,
      percent: Math.round((value / total) * 100),
      color: STATUS_COLORS[label] ?? 'var(--raw-brand-600)',
    };
  });
}

export type DonutSegment = DistributionSlice & {
  /** Share as a fraction in [0,1]; segments sum to 1 for arc geometry. */
  fraction: number;
};

/** Same ordering/colors as the stacked bar, plus arc fractions for the donut. */
export function donutSegments(statusBuckets: Bucket[] | undefined): DonutSegment[] {
  const distribution = statusDistribution(statusBuckets);
  const total = distribution.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return [];
  return distribution.map((slice) => ({ ...slice, fraction: slice.value / total }));
}

/**
 * Trend-chart geometry: maps buckets onto a viewBox with fixed padding and a
 * y-scale from 0 to the smallest "nice" ceiling (2/4/6 grid) above the data.
 */
export function trendGeometry(
  buckets: Bucket[],
  width: number,
  height: number,
  pad: number,
): { points: Array<Bucket & { x: number; y: number }>; niceMax: number } {
  const rawMax = Math.max(...buckets.map((bucket) => bucket.value), 1);
  const step = rawMax > 40 ? 20 : rawMax > 15 ? 10 : rawMax > 7 ? 5 : 2;
  const niceMax = Math.max(Math.ceil(rawMax / step) * step, step);
  const points = buckets.map((bucket, index) => {
    const x =
      buckets.length <= 1 ? width / 2 : pad + (index / (buckets.length - 1)) * (width - pad * 2);
    const y = height - pad - (bucket.value / niceMax) * (height - pad * 2);
    return { ...bucket, x, y };
  });
  return { points, niceMax };
}
