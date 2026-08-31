import { Card } from '@care/ui';
import { trendDeltaPercent, trendGeometry } from '../lib/dashboard-math';
import type { Bucket } from '../lib/dashboard-math';
import { formatAxisDate } from '../lib/formatters';

const WIDTH = 640;
const HEIGHT = 210;
const PAD = 18;
const Y_TICKS = 3;

/**
 * Trend line card (screens 17/20/25): labelled y grid, date axis, gradient
 * area, an end-point marker with the latest value chip, and an optional
 * "+n% vs periode sebelumnya" delta badge fed by the aggregate.
 */
export function TrendCard({
  title,
  buckets,
  previousTotal,
  total,
}: {
  title: string;
  buckets: Bucket[];
  previousTotal?: number | undefined;
  total?: number | undefined;
}) {
  const { points, niceMax } = trendGeometry(buckets, WIDTH, HEIGHT, PAD);
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const first = buckets[0];
  const last = buckets.at(-1);
  const middle = buckets.length > 4 ? buckets[Math.floor(buckets.length / 2)] : undefined;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area =
    points.length > 1 && firstPoint && lastPoint
      ? `${path} L ${lastPoint.x} ${HEIGHT - PAD} L ${firstPoint.x} ${HEIGHT - PAD} Z`
      : '';
  const sum = total ?? buckets.reduce((accumulated, bucket) => accumulated + bucket.value, 0);
  const delta = trendDeltaPercent(sum, previousTotal);
  return (
    <Card className="trend-card">
      <div className="chart-card__head">
        <h3>{title}</h3>
        {delta !== null ? (
          <span className="trend-card__delta" data-direction={delta >= 0 ? 'up' : 'down'}>
            <strong>
              {delta > 0 ? '+' : ''}
              {delta}%
            </strong>
            <small>vs periode sebelumnya</small>
          </span>
        ) : (
          <span className="chart-card__total">{sum}</span>
        )}
      </div>
      {points.length && first && last ? (
        <>
          <svg
            className="trend-chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Trend Voice dari ${formatAxisDate(first.label)} sampai ${formatAxisDate(last.label)}: total ${sum} Voice`}
          >
            <defs>
              <linearGradient id="trend-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(8 102 255 / 16%)" />
                <stop offset="100%" stopColor="rgb(8 102 255 / 2%)" />
              </linearGradient>
            </defs>
            {Array.from({ length: Y_TICKS + 1 }, (_, tick) => {
              const value = Math.round((niceMax / Y_TICKS) * (Y_TICKS - tick));
              const y = PAD + (tick / Y_TICKS) * (HEIGHT - PAD * 2);
              return (
                <g key={tick} aria-hidden="true">
                  <line className="trend-chart__grid" x1={PAD} x2={WIDTH - PAD} y1={y} y2={y} />
                  <text className="trend-chart__tick" x={2} y={y + 4}>
                    {value}
                  </text>
                </g>
              );
            })}
            {area ? (
              <path className="trend-chart__area" d={area} fill="url(#trend-area-fill)" />
            ) : null}
            <path className="trend-chart__line" d={path} />
            {points.map((point) => (
              <circle
                key={point.label}
                className="trend-chart__point"
                cx={point.x}
                cy={point.y}
                r="4"
              >
                <title>{`${formatAxisDate(point.label)}: ${point.value} Voice`}</title>
              </circle>
            ))}
            {lastPoint ? (
              <g className="trend-chart__flag" aria-hidden="true">
                <rect
                  x={Math.min(Math.max(lastPoint.x - 24, PAD), WIDTH - PAD - 48)}
                  y={Math.max(lastPoint.y - 34, 2)}
                  width="48"
                  height="22"
                  rx="8"
                />
                <text
                  x={Math.min(Math.max(lastPoint.x - 24, PAD) + 24, WIDTH - PAD - 24)}
                  y={Math.max(lastPoint.y - 34, 2) + 15}
                  textAnchor="middle"
                >
                  {lastPoint.value}
                </text>
              </g>
            ) : null}
          </svg>
          <div className="trend-card__axis" aria-hidden="true">
            <span>{formatAxisDate(first.label)}</span>
            {middle ? <span>{formatAxisDate(middle.label)}</span> : null}
            <span>{formatAxisDate(last.label)}</span>
          </div>
        </>
      ) : (
        <p className="chart-card__caption">Belum ada Voice pada rentang ini.</p>
      )}
    </Card>
  );
}
