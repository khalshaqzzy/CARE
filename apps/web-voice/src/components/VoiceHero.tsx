import { IconButton } from '@care/ui';
import {
  AudioWaveform,
  Building2,
  Check,
  ChevronLeft,
  Clock,
  FileText,
  MapPin,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDate,
  SEVERITY_LABELS,
  VISIBILITY_LABELS,
  voiceStatusDisplay,
} from '../lib/formatters';
import { categoryIcon, SEVERITY_FLAG_TONES, statusFlagTone } from '../lib/voice-visuals';
import type { VoiceDetail } from '../workforce-api';

/**
 * Shared voice header for the detail and conversation surfaces (screens 13/20
 * of the member redesign): a full-bleed cobalt band with the back control,
 * CARE lockup, and live status pill, and an overlapping white card carrying
 * the title, context chips, area/PIC split, and location detail. `compact`
 * renders the conversation variant of the chip strip. Union audiences keep
 * the consent-first presentation inside the card.
 */
export function VoiceHero({
  voice,
  variant = 'full',
  onBack,
}: {
  voice: VoiceDetail;
  variant?: 'full' | 'compact';
  onBack: () => void;
}) {
  const closed = voice.status === 'CLOSED';
  const unionAudience =
    voice.audience === 'UNION_ANONYMOUS' || voice.audience === 'UNION_IDENTIFIED';
  const alias = voice.audience === 'UNION_ANONYMOUS' ? voice.anonymousReporter.alias : null;
  const reporterName = voice.audience === 'UNION_IDENTIFIED' ? voice.reporter.name : null;
  const pic = voice.currentHandler?.displayName ?? voice.routeOwner?.displayName ?? '—';
  const area = AREA_LABELS[voice.area] ?? voice.area;
  const categoryName = voice.category
    ? (voice.categoryNameSnapshot ?? CATEGORY_LABELS[voice.category] ?? voice.category)
    : null;
  const CategoryIcon = categoryIcon(voice.category);
  const cycles = (voice.closureCycles ?? []) as {
    cycleNumber: number;
    closedAt: string;
    reviewState?: string | null;
    reviewDeadline?: string | null;
  }[];
  const latestCycle = cycles.length
    ? cycles.reduce((latest, cycle) => (cycle.cycleNumber > latest.cycleNumber ? cycle : latest))
    : null;
  const lastClosedAt = latestCycle?.closedAt ?? null;
  const reviewState = latestCycle?.reviewState ?? null;
  const statusLabel = voiceStatusDisplay(voice.status, reviewState);

  return (
    <section className="voice-hero" aria-label={voice.displayId}>
      <div className="voice-hero__band">
        <div className="voice-hero__top">
          <IconButton
            aria-label="Kembali"
            variant="ghost"
            className="voice-hero__back"
            onClick={onBack}
          >
            <ChevronLeft size={22} />
          </IconButton>
          <div className="voice-hero__brand">
            <strong>CARE</strong>
            <span>{voice.displayId}</span>
          </div>
          <span
            className="voice-hero__status"
            data-tone={statusFlagTone(voice.status, reviewState)}
          >
            <AudioWaveform size={15} aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

        <div className="voice-hero__card">
          {closed ? (
            <>
              <div className="voice-hero__closedhead">
                <span className="voice-hero__check" aria-hidden="true">
                  <Check size={24} strokeWidth={3} />
                </span>
                <h1 className="voice-hero__title">{voice.title}</h1>
              </div>
              <div className="voice-hero__pills">
                <span className="voice-hero__pill">
                  <i data-tone={statusFlagTone(voice.status, reviewState)} aria-hidden="true" />
                  {statusLabel}
                </span>
                <span className="voice-hero__pill">
                  <i
                    data-tone={SEVERITY_FLAG_TONES[voice.severity] ?? 'medium'}
                    aria-hidden="true"
                  />
                  {SEVERITY_LABELS[voice.severity] ?? voice.severity}
                </span>
                {lastClosedAt ? (
                  <span className="voice-hero__pill voice-hero__pill--plain">
                    <Check size={13} aria-hidden="true" />
                    Ditutup {formatDate(lastClosedAt)}
                  </span>
                ) : null}
                {voice.status === 'CLOSED' && reviewState === 'PENDING' && latestCycle ? (
                  <span className="voice-hero__pill voice-hero__pill--plain">
                    <Clock size={13} aria-hidden="true" />
                    Otomatis diterima {formatDate(latestCycle.reviewDeadline)}
                  </span>
                ) : null}
              </div>
            </>
          ) : unionAudience ? (
            <>
              <h1 className="voice-hero__title">{voice.title}</h1>
              <div className="voice-hero__chips">
                <span className="voice-hero__chip">
                  <i
                    data-tone={SEVERITY_FLAG_TONES[voice.severity] ?? 'medium'}
                    aria-hidden="true"
                  />
                  {SEVERITY_LABELS[voice.severity] ?? voice.severity}
                </span>
                <span className="voice-hero__chip">
                  <UserRound size={15} aria-hidden="true" />
                  {alias ?? reporterName ?? 'Pelapor'}
                </span>
                <span className="voice-hero__chip">
                  <MapPin size={15} aria-hidden="true" />
                  {area}
                </span>
              </div>
              {variant === 'full' ? (
                <>
                  <div className="voice-hero__columns">
                    {alias ? (
                      <div className="voice-hero__column">
                        <small>Alias</small>
                        <span>
                          <UserRound size={14} aria-hidden="true" />
                          {alias}
                        </span>
                      </div>
                    ) : null}
                    <div className="voice-hero__column">
                      <small>Status</small>
                      <span>
                        <i
                          className="voice-hero__dot"
                          data-tone={statusFlagTone(voice.status, reviewState)}
                          aria-hidden="true"
                        />
                        {statusLabel}
                      </span>
                    </div>
                    <div className="voice-hero__column">
                      <small>Severity</small>
                      <span>
                        <i
                          className="voice-hero__dot"
                          data-tone={SEVERITY_FLAG_TONES[voice.severity] ?? 'medium'}
                          aria-hidden="true"
                        />
                        {SEVERITY_LABELS[voice.severity] ?? voice.severity}
                      </span>
                    </div>
                    {!alias ? (
                      <div className="voice-hero__column">
                        <small>PIC</small>
                        <span>
                          <UserRound size={14} aria-hidden="true" />
                          {pic}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {voice.audience === 'UNION_ANONYMOUS' ? (
                    <div className="voice-hero__plate">
                      <ShieldCheck size={20} aria-hidden="true" />
                      <div className="voice-hero__plate-body">
                        <p className="voice-hero__plate-title">Identitas disembunyikan</p>
                        <p className="voice-hero__plate-text">
                          Informasi pelapor dirahasiakan sepenuhnya. Alias hanya berlaku untuk Voice
                          ini.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="voice-hero__plate voice-hero__plate--identified">
                      <ShieldCheck size={20} aria-hidden="true" />
                      <div className="voice-hero__plate-body">
                        <p className="voice-hero__plate-title">
                          Identitas ditampilkan atas persetujuan pelapor
                        </p>
                        <p className="voice-hero__plate-text">
                          Informasi identitas ditampilkan secara terbatas dan hanya dapat diakses
                          oleh pihak berwenang yang ditugaskan.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="voice-hero__title">{voice.title}</h1>
              <div className="voice-hero__chips">
                {variant === 'full' ? (
                  <span className="voice-hero__chip">
                    <FileText size={15} aria-hidden="true" />
                    {VISIBILITY_LABELS[voice.visibility] ?? voice.visibility} Voice
                  </span>
                ) : null}
                <span className="voice-hero__chip">
                  <i
                    data-tone={SEVERITY_FLAG_TONES[voice.severity] ?? 'medium'}
                    aria-hidden="true"
                  />
                  {SEVERITY_LABELS[voice.severity] ?? voice.severity}
                </span>
                {variant === 'full' ? (
                  <span className="voice-hero__chip">
                    <i data-tone={statusFlagTone(voice.status, reviewState)} aria-hidden="true" />
                    {statusLabel}
                  </span>
                ) : null}
                {variant === 'full' && categoryName ? (
                  <span className="voice-hero__chip">
                    <CategoryIcon size={15} aria-hidden="true" />
                    {categoryName}
                  </span>
                ) : null}
                {variant === 'compact' ? (
                  <span className="voice-hero__chip">
                    <UserRound size={15} aria-hidden="true" />
                    PIC: {pic}
                  </span>
                ) : null}
                {variant === 'compact' ? (
                  <span className="voice-hero__chip">
                    <MapPin size={15} aria-hidden="true" />
                    {area}
                  </span>
                ) : null}
              </div>
              {variant === 'full' ? (
                <>
                  <div className="voice-hero__grid">
                    <span>
                      <MapPin size={17} aria-hidden="true" />
                      {area}
                    </span>
                    <span>
                      <UserRound size={17} aria-hidden="true" />
                      PIC: {pic}
                    </span>
                  </div>
                  <p className="voice-hero__location">
                    <Building2 size={17} aria-hidden="true" />
                    {voice.locationDetail}
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
