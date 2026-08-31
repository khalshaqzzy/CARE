import {
  Alert,
  Button,
  Card,
  Checkbox,
  ChoiceCardGroup,
  Dialog,
  Input,
  Stack,
  Textarea,
} from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  Check,
  EyeOff,
  Factory,
  FileText,
  ImagePlus,
  Info,
  Leaf,
  LoaderCircle,
  MapPin,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  SquarePen,
  UserRound,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DotMatrixOrb } from '../../components/DotMatrixOrb';
import { AREA_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import type { Attachment } from '../../workforce-api';
import {
  ReviewConsentConfirmation,
  ReviewContent,
  ReviewMetaBar,
  ReviewSummary,
} from './ReviewParts';
import { useDraftWizard, type Category, type Severity, type Visibility } from './useDraftWizard';

const AREA_OPTIONS = [
  { value: 'KARAWANG_1', label: 'Karawang 1', icon: <Factory size={15} /> },
  { value: 'KARAWANG_2', label: 'Karawang 2', icon: <Factory size={15} /> },
  { value: 'KARAWANG_3', label: 'Karawang 3', icon: <Factory size={15} /> },
  { value: 'SUNTER_1', label: 'Sunter 1', icon: <Warehouse size={15} /> },
  { value: 'SUNTER_2', label: 'Sunter 2', icon: <Warehouse size={15} /> },
];

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  SAFETY: <Shield size={20} />,
  ENVIRONMENT: <Leaf size={20} />,
  FACILITY: <Wrench size={20} />,
  WORK_DIFFICULTY: <Briefcase size={20} />,
};

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'SAFETY', label: 'Keselamatan' },
  { value: 'ENVIRONMENT', label: 'Lingkungan' },
  { value: 'FACILITY', label: 'Fasilitas' },
  { value: 'WORK_DIFFICULTY', label: 'Kesulitan Kerja' },
];

const SEVERITY_OPTIONS: { value: Severity; label: string; description: string }[] = [
  {
    value: 'LOW',
    label: 'Low',
    description: 'Tidak mendesak, tanpa dampak langsung pada operasi.',
  },
  {
    value: 'MEDIUM',
    label: 'Medium',
    description: 'Perlu follow-up tanpa bahaya langsung.',
  },
  {
    value: 'HIGH',
    label: 'High',
    description: 'Dampak signifikan pada safety, quality, atau people.',
  },
  {
    value: 'CRITICAL',
    label: 'Critical',
    description: 'Bahaya segera atau isu serious/compliance.',
  },
];

/** Wizard progress shown by the hairline stepper (fallback shares the analysis step). */
const STEP_PROGRESS = {
  visibility: 1,
  form: 2,
  processing: 3,
  fallback: 3,
  review: 4,
} as const;

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

function Stepper({ current }: { current: number }) {
  const steps = ['Jenis', 'Detail', 'Analisis', 'Tinjau', 'Selesai'];
  return (
    <div className="wizard-steps">
      <ol className="wizard-steps__rail" aria-label="Langkah pembuatan Voice">
        {steps.map((label, index) => {
          const n = index + 1;
          const state = n < current ? 'done' : n === current ? 'active' : 'todo';
          return (
            <li
              className={`wizard-steps__item is-${state}`}
              key={label}
              aria-current={n === current ? 'step' : undefined}
            >
              <span className="wizard-steps__dot" aria-hidden="true">
                {n < current ? <Check size={11} strokeWidth={3.5} /> : null}
              </span>
              <span className="wizard-steps__sr">{label}</span>
            </li>
          );
        })}
      </ol>
      <span className="wizard-steps__count" aria-hidden="true">
        {current}/5
      </span>
    </div>
  );
}

function ActionsBar({
  onBack,
  backLabel = 'Kembali',
  primary,
  pinned = false,
}: {
  onBack?: () => void;
  backLabel?: string;
  primary: React.ReactNode;
  /** Pin the bar directly above the mobile dock, even when the page is short. */
  pinned?: boolean;
}) {
  return (
    <div className={`wizard-actionsbar${pinned ? ' wizard-actionsbar--pinned' : ''}`}>
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
    <div className="wizard-page wizard-page--type">
      <Stepper current={STEP_PROGRESS.visibility} />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Langkah 1 dari 5</p>
          <h1>Mulai Voice baru</h1>
          <p>Pilih jalur yang tepat untuk suara Anda.</p>
        </header>
        {onError ? (
          <Alert tone="danger" title="Periksa kembali">
            {onError}
          </Alert>
        ) : null}
        <ChoiceCardGroup
          label="Jenis Voice"
          columns={1}
          indicator="radio"
          appearance="brand"
          className="voice-type-choices"
          value={choice ?? undefined}
          onValueChange={(value) => setChoice(value as Visibility)}
          options={[
            {
              value: 'GENERAL',
              label: 'General Voice',
              description: 'Ditangani oleh PIC organisasi',
              icon: <Briefcase size={20} />,
            },
            {
              value: 'PRIVATE',
              label: 'Private Voice',
              description: 'Ditangani secara aman oleh Union',
              icon: <ShieldCheck size={20} />,
            },
          ]}
        />
        <ActionsBar
          pinned
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
  const [areaOpen, setAreaOpen] = useState(false);
  const isPrivate = form.visibility === 'PRIVATE';

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
      <Stepper current={STEP_PROGRESS.form} />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Langkah 2 dari 5</p>
          <h1>Detail Voice {isPrivate ? 'Private' : 'General'}</h1>
          <p>
            {isPrivate
              ? 'Lengkapi detail agar Union dapat memverifikasi dan menindaklanjuti laporan Anda.'
              : 'Lengkapi detail agar AInsight dapat mengklasifikasikan dan memverifikasi lokasi Anda.'}
          </p>
        </header>

        {wizard.error ? (
          <Alert tone="danger" title="Periksa kembali">
            {wizard.error}
          </Alert>
        ) : null}

        <Card variant="raised" padding="lg" className="wizard-card">
          <section className="wizard-section" aria-label="Lokasi temuan">
            <div className="wizard-card__head">
              <span className="wizard-card__icon" aria-hidden="true">
                <MapPin size={18} />
              </span>
              <div className="wizard-card__heading">
                <small>Lokasi temuan</small>
                <strong>{form.area ? AREA_LABELS[form.area] : 'Pilih area temuan'}</strong>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="wizard-card__action"
                aria-label={form.area ? 'Ubah area temuan' : 'Pilih area temuan'}
                onClick={() => setAreaOpen(true)}
              >
                Ubah
              </Button>
            </div>
            <div className="wizard-divider" aria-hidden="true" />
            <Textarea
              label="Detail Lokasi"
              value={form.locationDetail}
              onChange={(event) => setField({ locationDetail: event.target.value })}
              rows={3}
              maxLength={200}
              counter={`${form.locationDetail.length}/200`}
              placeholder="Masukkan detail lokasi temuan"
              required
            />
            {form.locationDetail.trim().length >= 3 ? <LocationReviewHint wizard={wizard} /> : null}
          </section>
        </Card>

        <Card
          variant="raised"
          padding="lg"
          className={`wizard-card${isPrivate ? ' wizard-card--flagged' : ''}`}
        >
          <section className="wizard-section" aria-label="Voice composer">
            <div className="wizard-card__head">
              <span className="wizard-card__icon" aria-hidden="true">
                <SquarePen size={18} />
              </span>
              <h3 className="wizard-card__title">Voice composer</h3>
            </div>
            <Input
              label="Judul Voice"
              value={form.title}
              onChange={(event) => setField({ title: event.target.value })}
              maxLength={150}
              counter={`${form.title.length}/150`}
              placeholder="Tulis judul singkat dan jelas"
              required
            />
            <Textarea
              label="Detail Voice"
              value={form.detail}
              onChange={(event) => setField({ detail: event.target.value })}
              rows={6}
              maxLength={5000}
              counter={`${form.detail.length}/5000`}
              placeholder="Ceritakan detail temuan Anda di sini..."
              required
            />
            <div className="wizard-divider wizard-divider--dashed" aria-hidden="true" />
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
          </section>
        </Card>

        {isPrivate ? (
          <section className="wizard-block" aria-label="Identitas kepada Union">
            <div className="wizard-block__head">
              <span className="wizard-card__icon" aria-hidden="true">
                <ShieldCheck size={18} />
              </span>
              <h2 className="wizard-block__title">Identitas kepada Union</h2>
            </div>
            <ChoiceCardGroup
              label="Tampilkan nama kepada Union"
              columns={1}
              indicator="radio"
              appearance="brand"
              className="consent-choices"
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
                  value: 'TIDAK',
                  label: 'Sembunyikan identitas',
                  description: 'Union melihat alias anonim',
                  icon: <EyeOff size={20} />,
                },
                {
                  value: 'YA',
                  label: 'Tampilkan nama',
                  description: 'Union melihat profil yang disetujui',
                  icon: <UserRound size={20} />,
                },
              ]}
            />
          </section>
        ) : (
          <p className="wizard-ai-note">
            <Sparkles size={16} aria-hidden="true" /> AI akan membantu klasifikasi kategori &amp;
            severity
          </p>
        )}

        <ActionsBar
          onBack={() => wizard.setStep('visibility')}
          primary={
            <Button
              variant="primary"
              className="wizard-actionsbar__primary"
              loading={wizard.busy || uploading}
              onClick={() => void wizard.saveAndProcess()}
            >
              Simpan &amp; Analisis
            </Button>
          }
        />
      </Stack>

      <Dialog
        open={areaOpen}
        onOpenChange={setAreaOpen}
        title="Pilih area temuan"
        description="Area pabrik tempat temuan ditemukan."
        mobileSheet
      >
        <ChoiceCardGroup
          label="Area Temuan"
          variant="chip"
          value={form.area || undefined}
          onValueChange={(value) => {
            setField({ area: value });
            setAreaOpen(false);
          }}
          options={AREA_OPTIONS}
        />
      </Dialog>
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
      <div className="media-input__picker">
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
              {uploading ? <LoaderCircle size={18} className="spin" /> : <ImagePlus size={20} />}
              <span>{uploading ? 'Mengunggah…' : 'Tambah foto'}</span>
            </button>
          ) : null}
        </div>
        <p className="media-input__note">
          <Info size={14} aria-hidden="true" />
          <span>
            JPG, PNG, atau WebP
            <br />
            maksimum 10 MB per file.
          </span>
        </p>
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
    </section>
  );
}

function ProcessingStep({ wizard }: { wizard: Wizard }) {
  const { stages } = wizard;
  const done = (stages.persisted ? 1 : 0) + (stages.classified ? 1 : 0) + (stages.reviewed ? 1 : 0);
  return (
    <div className="wizard-page">
      <Stepper current={STEP_PROGRESS.processing} />
      <section className="processing-card" aria-live="polite" aria-label="Analisis AI berlangsung">
        <DotMatrixOrb progress={done / 3} animating={done < 3} />
        <h1>Menganalisis Voice Anda</h1>
        <p>CARE sedang memahami laporan dan memeriksa lokasi.</p>
        <ol className="processing-card__stages">
          <ProcessingStage
            icon={<FileText size={17} />}
            label="Detail diterima"
            state={stages.persisted ? 'done' : 'active'}
          />
          <ProcessingStage
            icon={<Sparkles size={17} />}
            label="Kategori & severity"
            state={
              stages.classified
                ? 'done'
                : stages.classifying
                  ? 'active'
                  : stages.persisted
                    ? 'active'
                    : 'todo'
            }
          />
          <ProcessingStage
            icon={<MapPin size={17} />}
            label="Verifikasi lokasi"
            state={
              stages.reviewed
                ? 'done'
                : stages.reviewing
                  ? 'active'
                  : stages.persisted
                    ? 'active'
                    : 'todo'
            }
          />
        </ol>
      </section>
      <p className="processing-card__hint">Mohon tetap di halaman ini</p>
      {wizard.error ? (
        <Alert tone="danger" title="Gagal menganalisis">
          {wizard.error}
        </Alert>
      ) : null}
    </div>
  );
}

function ProcessingStage({
  icon,
  label,
  state,
}: {
  icon: React.ReactNode;
  label: string;
  state: 'active' | 'done' | 'todo';
}) {
  return (
    <li className={`processing-stage is-${state}`}>
      <span className="processing-stage__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="processing-stage__label">{label}</span>
      <span className="processing-stage__mark" aria-hidden="true">
        {state === 'done' ? (
          <Check size={13} strokeWidth={3.5} />
        ) : state === 'active' ? (
          <span className="processing-stage__spinner" />
        ) : null}
      </span>
    </li>
  );
}

function FallbackStep({ wizard }: { wizard: Wizard }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const needsCategory = wizard.form.visibility === 'GENERAL';
  const fallback = wizard.classification;
  const fallbackCode = fallback && 'fallbackCode' in fallback ? fallback.fallbackCode : null;

  return (
    <div className="wizard-page">
      <Stepper current={STEP_PROGRESS.fallback} />
      <Stack gap="lg">
        <Alert tone="warning" title="AI belum dapat menentukan hasil dengan aman.">
          Klasifikasi otomatis tidak tersedia{fallbackCode ? ` (${fallbackCode})` : ''}. Pilih
          kategori dan severity secara manual agar Voice tetap dapat dikirim.
        </Alert>
        <header className="page-intro">
          <h1>Klasifikasi manual</h1>
          <p>Pilih kategori &amp; severity</p>
        </header>
        {wizard.error ? (
          <Alert tone="danger" title="Periksa kembali">
            {wizard.error}
          </Alert>
        ) : null}
        {needsCategory ? (
          <section className="wizard-block" aria-label="Kategori">
            <h2 className="wizard-block__title">Kategori</h2>
            <ChoiceCardGroup
              label="Kategori"
              columns={2}
              indicator="radio"
              appearance="brand"
              className="category-choices"
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
          <p className="wizard-info-note">
            <Info size={16} /> Kategori tidak digunakan untuk Private Voice.
          </p>
        )}
        <section className="wizard-block" aria-label="Severity">
          <h2 className="wizard-block__title">Severity</h2>
          <ChoiceCardGroup
            label="Severity"
            columns={1}
            indicator="radio"
            appearance="brand"
            className="severity-rail"
            value={severity ?? undefined}
            onValueChange={(value) => setSeverity(value as Severity)}
            options={SEVERITY_OPTIONS}
          />
        </section>
        <p className="wizard-info-note wizard-info-note--brand">
          <Check size={16} aria-hidden="true" /> Pilihan manual akan dicatat
        </p>
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
  const { form, classification, locationReview, draft } = wizard;
  const api = useApi();
  const sessionId = useSessionId();
  const [ack, setAck] = useState(false);
  const isIncomplete = locationReview?.completeness === 'INCOMPLETE';
  const source = classification && 'source' in classification ? classification.source : null;
  const severity = classification && 'severity' in classification ? classification.severity : null;
  const category = classification && 'category' in classification ? classification.category : null;
  const isPrivate = form.visibility === 'PRIVATE';

  const preview = useQuery({
    queryKey: voiceQuery(sessionId, 'draft', draft?.id ?? 'none', 'review-preview'),
    queryFn: () => api.previewDraft(draft!.id),
    enabled: Boolean(draft),
  });
  const readiness = preview.data?.routeReadiness;
  const routeLabel = readiness?.ready
    ? (preview.data?.routeTarget ?? readiness.targetLabel ?? 'Akan ditentukan')
    : 'Akan ditentukan';

  return (
    <div className="wizard-page">
      <Stepper current={STEP_PROGRESS.review} />
      <Stack gap="lg">
        <header className="page-intro">
          <p className="care-eyebrow">Langkah 4 dari 5</p>
          <h1>Tinjau sebelum kirim</h1>
          <p>
            {isPrivate
              ? 'Periksa ringkasan laporan Anda. Pastikan detail sudah tepat sebelum dikirim.'
              : 'Periksa ringkasan laporan Anda sebelum mengirim Voice.'}
          </p>
        </header>

        {wizard.error ? (
          <Alert tone="danger" title="Voice tidak dapat dikirim">
            {wizard.error}
          </Alert>
        ) : null}

        <ReviewSummary
          visibility={form.visibility}
          severity={severity}
          category={isPrivate ? null : category}
          routeLabel={isPrivate ? 'Union Head' : routeLabel}
          showIdentity={form.showReporterIdentity}
          fallbackCode={
            source === 'MANUAL_FALLBACK' && classification && 'fallbackCode' in classification
              ? classification.fallbackCode
              : null
          }
        />

        <ReviewContent
          title={form.title}
          areaLabel={form.area ? (AREA_LABELS[form.area] ?? form.area) : '—'}
          locationDetail={form.locationDetail}
          detail={form.detail}
          attachments={wizard.attachments}
        />

        <ReviewMetaBar source={source} completeness={locationReview?.completeness ?? null} />

        {isPrivate ? (
          <ReviewConsentConfirmation showIdentity={form.showReporterIdentity === true} />
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
