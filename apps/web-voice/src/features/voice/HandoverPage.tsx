import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Skeleton,
  Stack,
  Textarea,
} from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, LockKeyhole, Search, Send, UserRound } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  filterHandoverOptions,
  HandoverDestinationCard,
} from '../../components/HandoverDestinationCard';
import { VoiceHero } from '../../components/VoiceHero';
import { useApi, useMutationKey, useSessionId, voiceQuery } from '../../lib/query';
import type { HandoverOption } from '../../workforce-api';

const DETAIL_LIMIT = 4_000;

export function HandoverPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutationKey = useMutationKey('handover');
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);

  const voice = useQuery({
    queryKey: voiceQuery(sessionId, 'voice', id),
    queryFn: () => api.voiceDetail(id),
    enabled: Boolean(id),
  });
  const options = useQuery({
    queryKey: voiceQuery(sessionId, 'handover-options', id),
    queryFn: () => api.handoverOptions(id),
    enabled: Boolean(id),
  });

  const filtered = useMemo(() => {
    return filterHandoverOptions(options.data?.options ?? [], search);
  }, [options.data?.options, search]);
  const selected = options.data?.options.find(
    (option) => option.available && option.category.id === selectedId,
  );
  const noteValid = detail.trim().length > 0 && detail.trim().length <= DETAIL_LIMIT;

  const refreshAfterConflict = async (code?: string) => {
    const result = await options.refetch();
    await voice.refetch();
    const stillValid = result.data?.options.some(
      (option) => option.available && option.category.id === selectedId,
    );
    if (!stillValid) setSelectedId('');
    setRecovery(
      code === 'VERSION_CONFLICT'
        ? 'Voice telah berubah. Opsi terbaru sudah dimuat; periksa kembali tujuan sebelum melanjutkan.'
        : code === 'HANDOVER_INVALID_STATE'
          ? 'Voice tidak lagi memenuhi syarat handover. Catatan Anda tetap tersimpan.'
          : 'Konfigurasi tujuan berubah. Opsi terbaru sudah dimuat; pilih kembali bila tujuan tidak lagi tersedia.',
    );
  };

  const handover = useMutation({
    mutationFn: () =>
      api.handover(
        id,
        {
          targetCategoryId: selectedId,
          detail: detail.trim(),
          expectedVersion: voice.data?.version ?? 0,
        },
        mutationKey.key(),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId) });
      void navigate('/work-items', {
        replace: true,
        state: { handoverSuccess: 'Voice berhasil dihandover kepada PIC baru.' },
      });
    },
    onError: async (cause) => {
      const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
      if (
        [
          'VERSION_CONFLICT',
          'HANDOVER_INVALID_STATE',
          'HANDOVER_DESTINATION_UNAVAILABLE',
          'HANDOVER_CATEGORY_CONFIGURATION_CHANGED',
          'HANDOVER_DESTINATION_SELF',
        ].includes(code)
      ) {
        await refreshAfterConflict(code);
      } else {
        setRecovery(cause instanceof Error ? cause.message : 'Handover gagal. Coba kembali.');
      }
      setConfirming(false);
    },
    onSettled: mutationKey.reset,
  });

  if (voice.isLoading || options.isLoading) {
    return (
      <div className="handover-page">
        <Skeleton label="Memuat halaman handover" />
      </div>
    );
  }
  if (voice.isError || options.isError || !voice.data || !options.data) {
    return (
      <div className="handover-page handover-page--error">
        <Card>
          <EmptyState
            title="Handover tidak tersedia"
            description="Voice mungkin sudah berubah atau bukan lagi tanggung jawab Anda."
            action={<Button onClick={() => void navigate(-1)}>Kembali</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="voice-detail-page handover-page">
      <VoiceHero voice={voice.data} onBack={() => void navigate(-1)} />
      <section className="handover-page__intro">
        <span className="handover-page__eyebrow">Rute penanganan</span>
        <h2>Handover Voice</h2>
        <p>
          Pilih kategori yang paling sesuai. Department dan PIC tujuan mengikuti rute aktif kategori
          tersebut.
        </p>
      </section>

      <Card padding="md" className="handover-current-route">
        <div className="handover-current-route__title">
          <i aria-hidden="true" /> Rute saat ini
        </div>
        <div className="handover-current-route__grid">
          <span>
            <small>Kategori</small>
            <strong>
              {options.data.current.category.name ?? options.data.current.category.key ?? '—'}
            </strong>
          </span>
          <span>
            <small>Department</small>
            <strong>{options.data.current.department?.department ?? '—'}</strong>
          </span>
          <span>
            <small>PIC</small>
            <strong>{options.data.current.pic.displayName}</strong>
          </span>
          <span>
            <small>Divisi</small>
            <strong>{options.data.current.department?.division ?? '—'}</strong>
          </span>
        </div>
      </Card>

      {recovery ? (
        <Alert tone="warning" title="Periksa perubahan terbaru">
          {recovery}
        </Alert>
      ) : null}

      <div className="handover-page__layout">
        <section className="handover-page__options" aria-labelledby="handover-options-title">
          <div className="handover-page__section-heading">
            <div>
              <h3 id="handover-options-title">Pilih tujuan</h3>
              <p>{options.data.options.length} kategori tersedia untuk diperiksa</p>
            </div>
          </div>
          <Input
            label="Cari tujuan handover"
            hideLabel
            leading={<Search size={18} />}
            placeholder="Cari kategori, department, divisi, atau PIC"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {filtered.length ? (
            <div
              className="handover-destination-list"
              role="radiogroup"
              aria-label="Tujuan handover"
            >
              {filtered.map((option) => (
                <HandoverDestinationCard
                  key={
                    option.category.id ?? option.category.key ?? option.disabledReason ?? 'route'
                  }
                  option={option}
                  selected={option.category.id === selectedId}
                  onSelect={() => {
                    setSelectedId(option.category.id ?? '');
                    setRecovery(null);
                  }}
                />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="Tujuan tidak ditemukan"
                description="Coba kata kunci kategori, department, divisi, atau nama PIC lain."
              />
            </Card>
          )}
        </section>

        <aside className="handover-page__note" aria-labelledby="handover-note-title">
          <Card variant="raised" padding="md">
            <Stack gap="md">
              <div className="handover-page__section-heading">
                <div>
                  <h3 id="handover-note-title">Detail handover</h3>
                  <p>Berikan konteks yang dibutuhkan PIC baru untuk melanjutkan penanganan.</p>
                </div>
              </div>
              <Textarea
                label="Detail handover"
                required
                rows={7}
                maxLength={DETAIL_LIMIT}
                value={detail}
                onBlur={() => setTouched(true)}
                onChange={(event) => {
                  setDetail(event.target.value);
                  setRecovery(null);
                }}
                counter={`${detail.length.toLocaleString('id-ID')}/${DETAIL_LIMIT.toLocaleString('id-ID')}`}
                {...(touched && !noteValid ? { errorText: 'Detail handover wajib diisi.' } : {})}
                placeholder="Contoh: Jelaskan konteks, pemeriksaan awal, dan tindak lanjut yang diperlukan…"
              />
              <p className="handover-page__privacy">
                <LockKeyhole size={16} aria-hidden="true" />
                Hanya dapat dilihat oleh PIC lama dan PIC baru.
              </p>
              {selected ? (
                <DestinationSummary option={selected} />
              ) : (
                <div className="handover-page__empty-summary">
                  <Send size={19} aria-hidden="true" />
                  <span>
                    <strong>Belum ada tujuan dipilih</strong>
                    <small>Pilih satu rute yang tersedia untuk melanjutkan.</small>
                  </span>
                </div>
              )}
            </Stack>
          </Card>
        </aside>
      </div>

      <footer className="handover-footer">
        <div className="handover-footer__inner">
          <Button variant="secondary" onClick={() => void navigate(-1)}>
            Batal
          </Button>
          <Button
            ref={confirmButtonRef}
            variant="primary"
            disabled={!selected || !noteValid}
            onClick={() => {
              setTouched(true);
              if (selected && noteValid) setConfirming(true);
            }}
          >
            Lanjutkan Handover <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </div>
      </footer>

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Konfirmasi handover"
        description="Pastikan rute dan PIC tujuan sudah tepat."
        size="sm"
        finalFocusRef={confirmButtonRef}
      >
        {selected ? (
          <Stack gap="md">
            <DestinationSummary option={selected} />
            <Alert tone="info" title="Catatan bersifat privat">
              Detail handover hanya dapat dibaca oleh Anda dan PIC tujuan untuk transfer ini.
            </Alert>
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Periksa lagi
              </Button>
              <Button
                variant="primary"
                loading={handover.isPending}
                onClick={() => handover.mutate()}
              >
                Konfirmasi Handover
              </Button>
            </div>
          </Stack>
        ) : null}
      </Dialog>
    </div>
  );
}

function DestinationSummary({ option }: { option: HandoverOption }) {
  return (
    <div className="handover-summary">
      <span className="handover-summary__label">Tujuan terpilih</span>
      <strong>{option.category.name ?? option.category.key}</strong>
      <span>
        <Building2 size={15} aria-hidden="true" /> {option.department?.department}
      </span>
      <span>
        <UserRound size={15} aria-hidden="true" /> {option.pic?.displayName}
      </span>
    </div>
  );
}
