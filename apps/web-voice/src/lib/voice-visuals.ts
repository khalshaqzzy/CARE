import { Building2, ClipboardList, FileText, Heart, Leaf, ShieldCheck, Wrench } from 'lucide-react';

/** Status flag tones used by dots and pills on light surfaces. */
export const STATUS_FLAG_TONES: Record<string, string> = {
  OPEN: 'open',
  IN_VERIFICATION: 'verification',
  IN_PROGRESS: 'progress',
  CLOSED: 'closed',
};

/**
 * Status dot tone that folds the closure review state in: a pending review is
 * amber, an accepted closure keeps the closed green, and a reopened voice
 * (rejected cycle) turns danger red.
 */
export function statusFlagTone(status: string, reviewState?: string | null): string {
  if (status === 'CLOSED') return reviewState === 'PENDING' ? 'review-pending' : 'closed';
  if (status === 'IN_VERIFICATION' && reviewState === 'REJECTED') return 'reopened';
  return STATUS_FLAG_TONES[status] ?? 'verification';
}

/** Severity flag tones used by dots on light surfaces. */
export const SEVERITY_FLAG_TONES: Record<string, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * Category glyphs for the hero chip strip. The catalog is dynamic, so unknown
 * keys fall back to a neutral document glyph instead of breaking the chip.
 */
const CATEGORY_ICONS: Record<string, typeof ShieldCheck> = {
  SAFETY: ShieldCheck,
  ENVIRONMENT: Leaf,
  FACILITY: Building2,
  FACILITY_REPAIR: Wrench,
  WORK_DIFFICULTY: ClipboardList,
  WELFARE: Heart,
};

export function categoryIcon(category: string | null | undefined) {
  return (category && CATEGORY_ICONS[category]) || FileText;
}
