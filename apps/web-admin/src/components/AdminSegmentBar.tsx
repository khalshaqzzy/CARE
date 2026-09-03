/**
 * Segmented progress bar (rounded blue segments + trailing percent), the
 * premium evolution of the existing `admin-pulse__segments` pattern.
 */
export function AdminSegmentBar({ percent, label }: { percent: number; label: string }) {
  const segments = 24;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.min(
    segments,
    Math.max(Math.round((clamped / 100) * segments), clamped > 0 ? 1 : 0),
  );
  return (
    <div className="admin-segments">
      <div
        className="admin-segments__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        {Array.from({ length: segments }, (_, index) => (
          <i key={index} data-filled={index < filled} aria-hidden="true" />
        ))}
      </div>
      <span className="admin-segments__pct">{clamped}%</span>
    </div>
  );
}
