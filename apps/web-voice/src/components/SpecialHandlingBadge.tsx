import { Hourglass } from 'lucide-react';

/** Marks a Diproses Voice handled without a deadline (Penanganan Khusus). */
export function SpecialHandlingBadge() {
  return (
    <span className="voice-special">
      <Hourglass size={12} aria-hidden="true" />
      Penanganan Khusus
    </span>
  );
}
