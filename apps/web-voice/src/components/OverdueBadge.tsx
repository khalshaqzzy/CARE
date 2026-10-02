import { AlarmClock } from 'lucide-react';

/** Marks a Voice whose live handling target has passed while it is still Diproses. */
export function OverdueBadge() {
  return (
    <span className="voice-overdue">
      <AlarmClock size={12} aria-hidden="true" />
      Terlambat
    </span>
  );
}
