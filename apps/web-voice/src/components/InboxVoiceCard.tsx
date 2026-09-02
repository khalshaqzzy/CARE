import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MinusCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { VoiceListItem } from '../workforce-api';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatRelative,
  SEVERITY_LABELS,
  voiceStatusDisplay,
} from '../lib/formatters';

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  CRITICAL: <AlertTriangle size={16} />,
  HIGH: <ArrowUpCircle size={16} />,
  MEDIUM: <MinusCircle size={16} />,
  LOW: <ArrowDownCircle size={16} />,
};

function statusIcon(status: string): React.ReactNode {
  if (status === 'CLOSED') return <CheckCircle2 size={13} aria-hidden="true" />;
  if (status === 'IN_PROGRESS') return <LoaderCircle size={13} aria-hidden="true" />;
  return null;
}

/** Chip key that folds the review state in so CSS can tint it distinctly. */
function statusChipKey(status: string, reviewState?: string | null): string {
  if (status === 'CLOSED' && reviewState === 'PENDING') return 'REVIEW_PENDING';
  if (status === 'IN_VERIFICATION' && reviewState === 'REJECTED') return 'REOPENED';
  return status;
}

/**
 * Severity-first operational queue card (screens 18/21/22): a colored edge
 * bar by severity, icon-labelled severity, title + chevron, area • category
 * meta, and a footer of status chip, relative time, and a PIC/unassigned
 * chip. `identity` swaps the severity headline for the consented Union alias
 * tile and moves severity into a tinted chip. The whole card is one button,
 * mirroring the history card pattern.
 */
export function InboxVoiceCard({
  voice,
  onOpen,
  identity,
  showPic = true,
}: {
  voice: VoiceListItem;
  onOpen: () => void;
  /** Present on Union private lists — renders the alias tile + severity chip. */
  identity?: { alias: string | null };
  showPic?: boolean;
}) {
  const handlerName = voice.currentHandlerName ?? null;
  const unassigned = voice.status === 'OPEN' && !handlerName;
  const pic = handlerName ? `PIC: ${handlerName}` : null;
  const area = AREA_LABELS[voice.area] ?? voice.area;
  const category = voice.category
    ? (voice.categoryNameSnapshot ?? CATEGORY_LABELS[voice.category] ?? voice.category)
    : null;
  return (
    <button
      type="button"
      className="inbox-card"
      data-severity={voice.severity}
      onClick={onOpen}
      aria-label={`Buka ${voice.displayId}`}
    >
      <span className="inbox-card__layout">
        {identity ? (
          <span className="inbox-card__avatar" aria-hidden="true">
            <UserRound size={22} />
            <span className="inbox-card__avatar-badge">
              <ShieldCheck size={11} />
            </span>
          </span>
        ) : null}
        <span className="inbox-card__body">
          <span className="inbox-card__top">
            {identity ? (
              <>
                <span className="inbox-card__alias">{identity.alias ?? voice.displayId}</span>
                <span className="inbox-card__sevchip" data-severity={voice.severity}>
                  {SEVERITY_LABELS[voice.severity] ?? voice.severity}
                </span>
              </>
            ) : (
              <span className="inbox-card__severity">
                {SEVERITY_ICONS[voice.severity]}
                {SEVERITY_LABELS[voice.severity] ?? voice.severity}
              </span>
            )}
          </span>
          <span className="inbox-card__title">{voice.title}</span>
          <span className="inbox-card__meta">
            {identity ? <span className="inbox-card__id">{voice.displayId}</span> : area}
            {category ? (
              <>
                <span className="inbox-card__dot" aria-hidden="true" />
                {category}
              </>
            ) : null}
          </span>
          <span className="inbox-card__foot">
            <span
              className="inbox-card__status"
              data-status={statusChipKey(voice.status, voice.closureReviewState)}
            >
              {statusIcon(voice.status)}
              {voiceStatusDisplay(voice.status, voice.closureReviewState)}
            </span>
            <span className="inbox-card__time">
              <Clock3 size={12} aria-hidden="true" />
              {formatRelative(voice.updatedAt)}
            </span>
            {showPic && pic ? (
              <span className="inbox-card__pic">
                <UserRound size={12} aria-hidden="true" />
                {pic}
              </span>
            ) : null}
            {showPic && unassigned ? (
              <span className="inbox-card__pic inbox-card__pic--open">Belum ditugaskan</span>
            ) : null}
          </span>
        </span>
        <ChevronRight size={20} className="inbox-card__chevron" aria-hidden="true" />
      </span>
    </button>
  );
}
