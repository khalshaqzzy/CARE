import {
  Alert,
  Button,
  Card,
  Checkbox,
  ChoiceCardGroup,
  Input,
  SeverityBadge,
  Skeleton,
  Stack,
  Textarea,
} from '@care/ui';
import {
  AlignLeft,
  Eye,
  EyeOff,
  Factory,
  FileText,
  Flame,
  ImagePlus,
  Info,
  Layers,
  Leaf,
  Loader2,
  MapPin,
  Radio,
  ShieldCheck,
  Sparkles,
  Tag,
  Warehouse,
  Wrench,
  Briefcase,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MediaGallery } from '../../components/MediaGallery';
import { AREA_LABELS, CATEGORY_LABELS } from '../../lib/formatters';
import type { Attachment } from '../../workforce-api';
import { useDraftWizard, type Category, type Severity, type Visibility } from './useDraftWizard';

const AREA_OPTIONS = [
  { value: 'KARAWANG_1', label: 'Karawang 1', icon: <Factory size={15} /> },
  { value: 'KARAWANG_2', label: 'Karawang 2', icon: <Factory size={15} /> },
  { value: 'KARAWANG_3', label: 'Karawang 3', icon: <Factory size={15} /> },
  { value: 'SUNTER_1', label: 'Sunter 1', icon: <Warehouse size={15} /> },
  { value: 'SUNTER_2', label: 'Sunter 2', icon: <Warehouse size={15} /> },
];

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  SAFETY: <Flame size={14} />,
  ENVIRONMENT: <Leaf size={14} />,
  FACILITY: <Wrench size={14} />,
  WORK_DIFFICULTY: <Briefcase size={14} />,
};

const SEVERITY_OPTIONS: {
  value: Severity;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'LOW',
    label: 'Low',
    description: 'Tidak mendesak, tanpa dampak langsung pada operasi.',
    icon: <span className="sev-dot sev-dot--low" aria-hidden="true" />,
  },
  {
    value: 'MEDIUM',
    label: 'Medium',
    description: 'Perlu follow-up tanpa bahaya langsung.',
    icon: <span className="sev-dot sev-dot--medium" aria-hidden="true" />,
  },
  {
    value: 'HIGH',
    label: 'High',
    description: 'Dampak signifikan pada safety, quality, atau people.',
    icon: <span className="sev-dot sev-dot--high" aria-hidden="true" />,
  },
  {
    value: 'CRITICAL',
    label: 'Critical',
    description: 'Bahaya segera atau isu serious/compliance.',
    icon: <span className="sev-dot sev-dot--critical" aria-hidden="true" />,
  },
];

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'SAFETY', label: 'Keselamatan' },
  { value: 'ENVIRONMENT', label: 'Lingkungan' },
  { value: 'FACILITY', label: 'Fasilitas' },
  { value: 'WORK_DIFFICULTY', label: 'Kesulitan Kerja' },
];

export function CreateVoicePage() {
  const { id } = useParams<{ id: string }>();
  const wizard = useDraftWizard(id);

  if (wizard.step === 'visibility') return <VisibilityStep wizard={wizard} />;
  if (wizard.step === 'form') return <FormStep wizard={wizard} />;
  if (wizard.step === 'processing') return <ProcessingStep wizard={wizard} />;
  if (wizard.step === 'fallback') return <FallbackStep wizard={wizard} />;
  return <ReviewStep wizard={wizard} />;
}

type Wizard = ReturnType<typeof useDraftWizard>;

function Stepper({ step }: { step: string }) {
  const steps = [
    { id: 'visibility', label: 'Jenis' },
    { id: 'form', label: 'Detail' },
    { id: 'processing', label: 'Analisis' },
    { id: 'fallback', label: 'Fallback' },
    { id: 'review', label: 'Tinjau' },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="wizard-steps" aria-label="Langkah pembuatan Voice">
      {steps.map((s, i) => {
        const state = i === idx ? 'active' : i < idx ? 'done' : 'todo';
        return (
          <li
            className={`wizard-steps__item is-${state}`}
            key={s.id}
            aria-current={i === idx ? 'step' : undefined}
          >
            <span className="wizard-steps__dot">{i < idx ? '✓' : i + 1}</span>
            <span className="wizard-steps__label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ActionsBar({
  onBack,
  backLabel = 'Kembali',
  primary,
}: {
  onBack?: () => void;
  backLabel?: string;
  primary: React.ReactNode;
}) {
  return (
    <div className="wizard-actionsbar">
      {onBack ? (
        <Button variant="secondary" onClick={onBack}>
          {backLabel}
        </Button>
      ) : null}
      {primary}
    </div>
  );
}

function VisibilityStep({ wizard }: { wizard: Wizard }) {
  const [choice, setChoice] = useState<Visibility | null>(null);
  const onError = wizard.error;
  return (
    <div className="wizard-page">
      <Stepper step="visibility" />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Langkah 1 dari 5</p>
          <h1>Pilih jenis Voice</h1>
          <p>Private Voice memerlukan Union; General Voice dirutekan ke Manager/departemen Anda.</p>
        </header>
        {onError ? (
          <Alert tone="danger" title="Periksa kembali">
            {onError}
          </Alert>
        ) : null}
        <ChoiceCardGroup
          label="Jenis Voice"
          columns={2}
          value={choice ?? undefined}
          onValueChange={(value) => setChoice(value as Visibility)}
          options={[
            {
              value: 'GENERAL',
              label: 'General Voice',
              description:
                'Dirutekan secara deterministik ke Manager/Department Head atau PIC sesuai kategori.',
              icon: <Layers size={16} />,
            },
            {
              value: 'PRIVATE',
              label: 'Private Voice',
              description:
                'Selalu ditangani Union Head dengan opsi menampilkan atau menyembunyikan identitas Anda.',
              icon: <ShieldCheck size={16} />,
            },
          ]}
        />
        <ActionsBar
          primary={
            <Button
              variant="primary"
              className="wizard-actionsbar__primary"
              disabled={!choice}
              onClick={() => {
                wizard.setField({ visibility: choice! });
                wizard.setStep('form');
              }}
            >
              Lanjutkan
            </Button>
          }
        />
      </Stack>
    </div>
  );
}

function FormStep({ wizard }: { wizard: Wizard }) {
  const { form, setField } = wizard;
  const [dirtyGuard, setDirtyGuard] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirtyGuard) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirtyGuard]);

  useEffect(() => setDirtyGuard(wizard.dirty), [wizard.dirty]);

  return (
    <div className="wizard-page">
      <Stepper step="form" />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Langkah 2 dari 5</p>
          <h1>Detail Voice {form.visibility === 'PRIVATE' ? 'Private' : 'General'}</h1>
          <p>
            Lengkapi detail agar AInsight dapat mengklasifikasikan dan memverifikasi lokasi Anda.
          </p>
        </header>

        {wizard.error ? (
          <Alert tone="danger" title="Periksa kembali">
            {wizard.error}
          </Alert>
        ) : null}

        <Card variant="raised" padding="lg" className="wizard-form">
          <Stack gap="lg">
            <section className="wizard-section" aria-label="Lokasi temuan">
              <div className="wizard-section__head">
                <MapPin size={16} />
                <h3>Lokasi temuan</h3>
              </div>
              <ChoiceCardGroup
                label="Area Temuan"
                variant="chip"
                value={form.area || undefined}
                onValueChange={(value) => setField({ area: value })}
                options={AREA_OPTIONS}
              />
              <Textarea
                label="Detail Lokasi"
                value={form.locationDetail}
                onChange={(event) => setField({ locationDetail: event.target.value })}
                rows={3}
                maxLength={200}
                counter={`${form.locationDetail.length}/200`}
                required
              />
              {form.locationDetail.trim().length >= 3 ? (
                <LocationReviewHint wizard={wizard} />
              ) : null}
            </section>

            <section className="wizard-section" aria-label="Detail Voice">
              <div className="wizard-section__head">
                <FileText size={16} />
                <h3>Detail Voice</h3>
              </div>
              <Input
                label="Judul Voice"
                value={form.title}
                onChange={(event) => setField({ title: event.target.value })}
                maxLength={150}
                counter={`${form.title.length}/150`}
                required
              />
              <Textarea
                label="Detail Voice"
                value={form.detail}
                onChange={(event) => setField({ detail: event.target.value })}
                rows={6}
                maxLength={5000}
                counter={`${form.detail.length}/5000`}
                required
              />
            </section>

            {form.visibility === 'PRIVATE' ? (
              <section className="consent-card" aria-label="Identitas kepada Union">
                <p className="consent-card__title">
                  <ShieldCheck size={16} /> Tampilkan nama Anda kepada Union?
                </p>
                <ChoiceCardGroup
                  label="Tampilkan nama kepada Union"
                  value={
                    form.showReporterIdentity === true
                      ? 'YA'
                      : form.showReporterIdentity === false
                        ? 'TIDAK'
                        : undefined
                  }
                  onValueChange={(value) => setField({ showReporterIdentity: value === 'YA' })}
                  options={[
                    {
                      value: 'YA',
                      label: 'Ya',
                      description: 'Union melihat nama, no.reg, division, dan department.',
                      icon: <Eye size={15} />,
                    },
                    {
                      value: 'TIDAK',
                      label: 'Tidak',
                      description: 'Union melihat alias anonim yang tidak dapat dikorelasikan.',
                      icon: <EyeOff size={15} />,
                    },
                  ]}
                />
              </section>
            ) : null}

            <MediaInput
              attachments={wizard.attachments}
              uploading={wizard.isUploading}
              onPick={async (files) => {
                setUploading(true);
                try {
                  await wizard.uploadFiles(files);
                } finally {
                  setUploading(false);
                }
              }}
              onRemove={(attachmentId) => wizard.removeAttachment(attachmentId)}
              max={5}
              inputRef={mediaInput}
            />
          </Stack>
        </Card>

        <ActionsBar
          onBack={() => wizard.setStep('visibility')}
          primary={
            <Button
              variant="primary"
              className="wizard-actionsbar__primary"
              loading={wizard.busy || uploading}
              onClick={() => void wizard.saveAndProcess()}
            >
              Simpan & Analisis
            </Button>
          }
        />
      </Stack>
    </div>
  );
}

function LocationReviewHint({ wizard }: { wizard: Wizard }) {
  const review = wizard.locationReview;
  if (!review) {
    return (
      <p className="location-hint is-neutral">
        <Info size={16} /> Lokasi akan diverifikasi otomatis saat Anda menyimpan draft.
      </p>
    );
  }
  if (review.completeness === 'COMPLETE')
    return (
      <p className="location-hint is-ok">
        <Info size={16} /> Lokasi dianggap lengkap.
      </p>
    );
  if (review.completeness === 'INCOMPLETE')
    return (
      <div className="location-hint is-warn">
        <p>
          <Info size={16} /> {review.warning ?? 'Detail lokasi belum lengkap.'}
        </p>
        {review.questions?.length ? (
          <ul className="location-hint__questions">
            {review.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  return (
    <p className="location-hint is-neutral">
      <Info size={16} /> Verifikasi lokasi tidak tersedia saat ini; Anda tetap dapat melanjutkan.
    </p>
  );
}

function MediaInput({
  attachments,
  uploading,
  onPick,
  onRemove,
  max,
  inputRef,
}: {
  attachments: Attachment[];
  uploading: boolean;
  onPick: (files: File[]) => Promise<void>;
  onRemove: (id: string) => void;
  max: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const remaining = max - attachments.length;
  return (
    <section className="media-input" aria-label="Foto lampiran">
      <div className="media-input__head">
        <span className="media-input__label" id="media-input-label">
          Foto Lampiran <small>(opsional)</small>
        </span>
        <span className="media-input__count" aria-hidden="true">
          {attachments.length}/{max}
        </span>
      </div>
      <div className="media-input__list" role="group" aria-labelledby="media-input-label">
        {attachments.map((attachment, index) => (
          <div className="media-input__item" key={attachment.id}>
            <img src={`/api/v1/media/${attachment.id}`} alt={`Lampiran ${index + 1}`} />
            <button
              type="button"
              className="media-input__remove"
              aria-label={`Hapus lampiran ${index + 1}`}
              onClick={() => onRemove(attachment.id)}
            >
              ×
            </button>
          </div>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            className="media-input__dropzone"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={`Tambah foto, sisa ${remaining}`}
          >
            {uploading ? <Loader2 size={18} className="spin" /> : <ImagePlus size={20} />}
            <span>{uploading ? 'Mengunggah…' : 'Tambah foto'}</span>
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void onPick(files);
          event.currentTarget.value = '';
        }}
      />
      <p className="media-input__note">JPG, PNG, atau WebP · maksimum 10 MB per file.</p>
    </section>
  );
}

function ProcessingStep({ wizard }: { wizard: Wizard }) {
  return (
    <div className="processing-page">
      <div className="processing-page__spinner">
        <Loader2 size={28} className="spin" />
      </div>
      <h1>Menganalisis Voice Anda</h1>
      <p>Klasifikasi kategori/severity dan verifikasi lokasi sedang dijalankan.</p>
      <div className="processing-page__lines" aria-hidden="true">
        <Skeleton />
        <Skeleton />
      </div>
      {wizard.error ? (
        <Alert tone="danger" title="Gagal menganalisis">
          {wizard.error}
        </Alert>
      ) : null}
    </div>
  );
}

function FallbackStep({ wizard }: { wizard: Wizard }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const needsCategory = wizard.form.visibility === 'GENERAL';
  const fallback = wizard.classification;
  const fallbackText =
    fallback && 'fallbackCode' in fallback
      ? fallback.fallbackCode
      : 'AI tidak dapat mengklasifikasikan';

  return (
    <div className="wizard-page">
      <Stepper step="fallback" />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Klasifikasi manual</p>
          <h1>Pilih kategori &amp; severity</h1>
          <p>
            AI gagal menghasilkan klasifikasi yang aman ({fallbackText}). Pilih secara manual agar
            Voice tetap dapat dikirim.
          </p>
        </header>
        {wizard.error ? (
          <Alert tone="danger" title="Periksa kembali">
            {wizard.error}
          </Alert>
        ) : null}
        <Card variant="raised" padding="lg" className="wizard-form">
          <Stack gap="lg">
            {needsCategory ? (
              <section className="wizard-section" aria-label="Kategori">
                <div className="wizard-section__head">
                  <Tag size={16} />
                  <h3>Kategori</h3>
                </div>
                <ChoiceCardGroup
                  label="Kategori"
                  variant="chip"
                  value={category ?? undefined}
                  onValueChange={(value) => setCategory(value as Category)}
                  options={CATEGORY_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                    icon: CATEGORY_ICONS[opt.value],
                  }))}
                />
              </section>
            ) : (
              <p className="consent-card__title">
                <ShieldCheck size={16} /> Kategori tidak digunakan untuk Private Voice.
              </p>
            )}
            <section className="wizard-section" aria-label="Severity">
              <div className="wizard-section__head">
                <Sparkles size={16} />
                <h3>Severity</h3>
              </div>
              <ChoiceCardGroup
                label="Severity"
                columns={2}
                value={severity ?? undefined}
                onValueChange={(value) => setSeverity(value as Severity)}
                options={SEVERITY_OPTIONS}
              />
            </section>
          </Stack>
        </Card>
        <ActionsBar
          primary={
            <Button
              variant="primary"
              className="wizard-actionsbar__primary"
              disabled={!severity || (needsCategory && !category)}
              loading={wizard.busy}
              onClick={() =>
                void wizard.runFallback({
                  category: needsCategory ? category : null,
                  severity: severity!,
                })
              }
            >
              Simpan &amp; Tinjau
            </Button>
          }
        />
      </Stack>
    </div>
  );
}

function ReviewStep({ wizard }: { wizard: Wizard }) {
  const { form, classification, locationReview } = wizard;
  const [ack, setAck] = useState(false);
  const isIncomplete = locationReview?.completeness === 'INCOMPLETE';
  const source = classification && 'source' in classification ? classification.source : null;
  const severity = classification && 'severity' in classification ? classification.severity : null;
  const category = classification && 'category' in classification ? classification.category : null;
  const fallbackCode =
    classification && 'fallbackCode' in classification ? classification.fallbackCode : null;

  return (
    <div className="wizard-page">
      <Stepper step="review" />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Langkah akhir</p>
          <h1>Tinjau sebelum kirim</h1>
          <p>Pastikan detail, klasifikasi, dan rute sudah sesuai sebelum Voice dikirim.</p>
        </header>

        {wizard.error ? (
          <Alert tone="danger" title="Voice tidak dapat dikirim">
            {wizard.error}
          </Alert>
        ) : null}

        <Card variant="raised" padding="lg" className="wizard-form">
          <div className="review-rows">
            <div className="review-row">
              <span className="review-row__label">
                <Layers size={14} /> Jenis
              </span>
              <span className="review-row__value">
                {form.visibility === 'PRIVATE' ? 'Private' : 'General'}
              </span>
            </div>
            <div className="review-row">
              <span className="review-row__label">
                <MapPin size={14} /> Area
              </span>
              <span className="review-row__value">{form.area ? AREA_LABELS[form.area] : '—'}</span>
            </div>
            {severity ? (
              <div className="review-row">
                <span className="review-row__label">
                  <Sparkles size={14} /> Severity
                </span>
                <span className="review-row__value">
                  <SeverityBadge severity={severity as Severity} />
                </span>
              </div>
            ) : null}
            {category ? (
              <div className="review-row">
                <span className="review-row__label">
                  <Tag size={14} /> Kategori
                </span>
                <span className="review-row__value">{CATEGORY_LABELS[category as Category]}</span>
              </div>
            ) : null}
            {form.visibility === 'PRIVATE' ? (
              <div className="review-row">
                <span className="review-row__label">
                  <Eye size={14} /> Identitas
                </span>
                <span className="review-row__value">
                  {form.showReporterIdentity ? 'Tampilkan nama' : 'Sembunyikan (anonim)'}
                </span>
              </div>
            ) : null}
            {source ? (
              <div className="review-row">
                <span className="review-row__label">
                  <Sparkles size={14} /> Sumber klasifikasi
                </span>
                <span className="review-row__value">
                  {source === 'AI' ? 'AI' : 'Manual Fallback'}
                  {fallbackCode ? ` · ${fallbackCode}` : ''}
                </span>
              </div>
            ) : null}
            <div className="review-row">
              <span className="review-row__label">
                <AlignLeft size={14} /> Judul
              </span>
              <span className="review-row__value">{form.title}</span>
            </div>
            <div className="review-row review-row--block">
              <span className="review-row__label">
                <FileText size={14} /> Detail
              </span>
              <p className="review-row__value review-row__text">{form.detail}</p>
            </div>
            <div className="review-row">
              <span className="review-row__label">
                <MapPin size={14} /> Lokasi
              </span>
              <span className="review-row__value">{form.locationDetail}</span>
            </div>
          </div>
        </Card>

        {wizard.attachments.length ? (
          <MediaGallery attachments={wizard.attachments} label="Lampiran foto" />
        ) : null}

        {isIncomplete ? (
          <Alert tone="warning" title="Detail lokasi belum lengkap">
            <Checkbox
              checked={ack}
              onCheckedChange={setAck}
              label="Saya menyadari lokasi belum lengkap dan Voice berpotensi tidak ditangani dengan baik."
            />
          </Alert>
        ) : null}

        <ActionsBar
          onBack={() => wizard.setStep('form')}
          primary={
            <Button
              variant="primary"
              className="wizard-actionsbar__primary"
              loading={wizard.isSubmitting}
              disabled={isIncomplete && !ack}
              onClick={() => void wizard.submit()}
            >
              <Radio size={18} /> Kirim Voice
            </Button>
          }
        />
      </Stack>
    </div>
  );
}
