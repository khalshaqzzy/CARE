import { Card } from '@care/ui';
import {
  Check,
  CircleAlert,
  EyeOff,
  FileText,
  Layers,
  MapPin,
  Megaphone,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { MediaGallery } from '../../components/MediaGallery';
import { CATEGORY_LABELS, SEVERITY_LABELS } from '../../lib/formatters';
import type { Attachment } from '../../workforce-api';

type Visibility = 'GENERAL' | 'PRIVATE';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type Category = string;
type Completeness = 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';

function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="review-summary__row">
      <span className="review-summary__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="review-summary__label">{label}</span>
      <strong className="review-summary__value">{value}</strong>
    </div>
  );
}

export function ReviewSummary({
  visibility,
  severity,
  category,
  routeLabel,
  showIdentity,
  fallbackCode,
}: {
  visibility: Visibility;
  severity: Severity | null;
  category: Category | null;
  routeLabel: string;
  showIdentity: boolean | null;
  fallbackCode: string | null;
}) {
  if (visibility === 'PRIVATE') {
    return (
      <section className="review-summary" aria-label="Ringkasan Private Voice">
        <div className="review-summary__hero">
          <span className="review-summary__shield" aria-hidden="true">
            <ShieldCheck size={26} />
          </span>
          <div>
            <strong>Private Voice</strong>
            {severity ? (
              <span className="review-summary__severity" data-severity={severity}>
                <i aria-hidden="true" />
                {SEVERITY_LABELS[severity] ?? severity}
              </span>
            ) : null}
          </div>
        </div>
        <div className="review-summary__rows">
          <SummaryRow icon={<MapPin size={16} />} label="Rute tujuan" value={routeLabel} />
          <SummaryRow
            icon={showIdentity ? <UserRound size={16} /> : <EyeOff size={16} />}
            label={showIdentity ? 'Identitas ditampilkan' : 'Identitas disembunyikan'}
            value={
              showIdentity ? 'Union melihat profil yang disetujui' : 'Union melihat alias anonim'
            }
          />
          {fallbackCode ? (
            <SummaryRow
              icon={<CircleAlert size={16} />}
              label="Klasifikasi"
              value={`Manual Fallback · ${fallbackCode}`}
            />
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section className="review-summary" aria-label="Ringkasan klasifikasi">
      <div className="review-summary__rows">
        <SummaryRow icon={<Megaphone size={16} />} label="Jenis Voice" value="General Voice" />
        {severity ? (
          <SummaryRow
            icon={<ShieldAlert size={16} />}
            label="Severity"
            value={SEVERITY_LABELS[severity] ?? severity}
          />
        ) : null}
        {category ? (
          <SummaryRow
            icon={<Layers size={16} />}
            label="Kategori"
            value={CATEGORY_LABELS[category] ?? category}
          />
        ) : null}
        <SummaryRow icon={<Send size={16} />} label="Rute tujuan" value={routeLabel} />
      </div>
    </section>
  );
}

export function ReviewContent({
  title,
  areaLabel,
  locationDetail,
  detail,
  attachments,
}: {
  title: string;
  areaLabel: string;
  locationDetail: string;
  detail: string;
  attachments: Attachment[];
}) {
  return (
    <Card variant="raised" padding="lg" className="review-content">
      <div className="review-content__head">
        <span className="review-content__icon" aria-hidden="true">
          <FileText size={20} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>
            <MapPin size={13} aria-hidden="true" /> {areaLabel}
            {locationDetail ? ` • ${locationDetail}` : ''}
          </p>
        </div>
      </div>
      <p className="review-content__body">{detail}</p>
      {attachments.length ? <MediaGallery attachments={attachments} label="Lampiran foto" /> : null}
    </Card>
  );
}

export function ReviewMetaBar({
  source,
  completeness,
}: {
  source: 'AI' | 'MANUAL_FALLBACK' | null;
  completeness: Completeness | null;
}) {
  return (
    <div className="review-meta">
      <div className="review-meta__cell">
        <Sparkles size={16} aria-hidden="true" />
        <div>
          <small>Sumber klasifikasi</small>
          <strong>
            {source === 'MANUAL_FALLBACK' ? 'Manual Fallback' : source === 'AI' ? 'AI' : '—'}
          </strong>
        </div>
      </div>
      <div className="review-meta__cell">
        <MapPin size={16} aria-hidden="true" />
        <div>
          <small>Lokasi</small>
          <strong>
            {completeness === 'COMPLETE'
              ? 'Lengkap'
              : completeness === 'INCOMPLETE'
                ? 'Perlu ditinjau'
                : 'Tidak tersedia'}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function ReviewConsentConfirmation({ showIdentity }: { showIdentity: boolean }) {
  return (
    <div className="review-consent">
      {showIdentity ? (
        <UserRound size={18} aria-hidden="true" />
      ) : (
        <EyeOff size={18} aria-hidden="true" />
      )}
      <strong>
        {showIdentity ? 'Union melihat profil yang disetujui' : 'Union melihat alias anonim'}
      </strong>
      <span className="review-consent__check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    </div>
  );
}
