/**
 * Shimmer skeleton for admin-web loading states (subtle-only motion,
 * static under prefers-reduced-motion via CSS).
 */
export function AdminSkeleton({
  lines = 3,
  label = 'Memuat data',
}: {
  lines?: number;
  label?: string;
}) {
  return (
    <div className="admin-skeleton" role="status" aria-label={label}>
      {Array.from({ length: Math.max(1, Math.min(8, lines)) }, (_, index) => (
        <i key={index} style={{ width: `${96 - index * 9}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}
