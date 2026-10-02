import { Alert, Button, ChoiceCardGroup, Dialog, Input, Stack, Textarea } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  ImagePlus,
  Lock,
  MapPin,
  MessageCircle,
  Play,
  Send,
  UserRound,
  UserRoundCheck,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTION_LABELS, AREA_LABELS } from '../lib/formatters';
import { formatTargetDate, previewHandlingTarget } from '../lib/handling-target';
import { useApi, useMutationKey, useSessionId, voiceQuery } from '../lib/query';
import type { Attachment, VoiceDetail } from '../workforce-api';
import { MediaGallery } from './MediaGallery';

type Action =
  | 'respond-sheet'
  | 'respond'
  | 'respond-process'
  | 'proceed'
  | 'target'
  | 'close'
  | 'assign'
  | 'reassign'
  | 'assignment-note'
  | 'take-over'
  | 'none';
type Assignment = { handlerAccountId: string; reason?: string };
type ResponseChoice = 'reply' | 'assign' | 'handover' | 'process';

const RESPONSE_CHOICES: Record<ResponseChoice, { label: string; icon: ReactNode }> = {
  reply: { label: 'Balas pesan', icon: <MessageCircle size={18} aria-hidden="true" /> },
  assign: { label: 'Tugaskan PIC', icon: <UserRoundCheck size={18} aria-hidden="true" /> },
  handover: { label: 'Handover', icon: <ArrowLeftRight size={18} aria-hidden="true" /> },
  process: { label: 'Proses sendiri', icon: <Play size={18} aria-hidden="true" /> },
};

export function ActionPanel({ detail }: { detail: VoiceDetail }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const actions = detail.availableActions ?? [];
  const [active, setActive] = useState<Action>('none');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [days, setDays] = useState('');
  const mutationKey = useMutationKey('voice-action');
  const request = useRef<{ signature: string; version: number } | null>(null);
  const validDays = /^\d+$/.test(days) && Number(days) <= 365;
  const refresh = () => queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId) });
  const open = (action: Action) => {
    setActive(action);
    setError(null);
    setText('');
    setDays('');
    request.current = null;
    mutationKey.reset();
  };
  const mutation = useMutation({
    mutationFn: async ({
      action,
      assignmentBody,
      note,
    }: {
      action: Action;
      assignmentBody?: Assignment;
      note?: string;
    }) => {
      const signature = JSON.stringify({ action, assignmentBody, note, days });
      if (request.current?.signature !== signature) {
        mutationKey.reset();
        request.current = { signature, version: detail.version };
      }
      const version = request.current.version;
      const key = mutationKey.key();
      if (action === 'respond') return api.respond(detail.id, { text: note!, version }, key);
      if (action === 'respond-process')
        return api.respond(detail.id, { text: note!, version, days: Number(days) }, key);
      if (action === 'proceed' || action === 'target')
        return (action === 'target' ? api.setTarget : api.proceed)(
          detail.id,
          { days: Number(days), version },
          key,
        );
      if (action === 'close') return api.close(detail.id, { note: note!, version }, key);
      if (action === 'take-over') return api.takeOver(detail.id, { expectedVersion: version }, key);
      return (action === 'reassign' ? api.reassign : api.assign)(
        detail.id,
        { ...assignmentBody!, ...(note ? { text: note } : {}), expectedVersion: version },
        key,
      );
    },
    onSuccess: async (_result, variables) => {
      mutationKey.reset();
      request.current = null;
      setError(null);
      await refresh();
      await queryClient.fetchQuery({
        queryKey: voiceQuery(sessionId, 'voice', detail.id),
        queryFn: () => api.voiceDetail(detail.id),
        staleTime: 0,
      });
      setActive('none');
      if (
        variables.action === 'respond' ||
        variables.action === 'respond-process' ||
        variables.action === 'assignment-note'
      )
        void navigate(`/voices/${detail.id}/chat`);
      else
        setNotice(
          variables.action === 'proceed' || variables.action === 'target'
            ? 'Target penyelesaian tersimpan. Pelapor dan penanggung jawab telah diberi tahu.'
            : variables.action === 'close'
              ? 'Voice berhasil ditutup. Percakapan kini hanya dapat dibaca.'
              : variables.action === 'take-over'
                ? 'Anda sekarang PIC Voice ini.'
                : 'PIC berhasil diperbarui.',
        );
    },
    onError: (cause) => {
      if (
        typeof cause === 'object' &&
        cause &&
        'code' in cause &&
        cause.code === 'VERSION_CONFLICT'
      ) {
        request.current = null;
        mutationKey.reset();
        void refresh();
      }
      setError(cause instanceof Error ? cause.message : 'Perubahan belum tersimpan. Coba lagi.');
    },
  });
  const pending = mutation.isPending;
  const cancel = () => {
    if (!pending) {
      setActive('none');
      setError(null);
    }
  };
  if (!actions.length) return null;
  // While the Voice is still open, every way of answering lives in one sheet.
  const responding = actions.includes('RESPOND');
  const choices: ResponseChoice[] = responding
    ? [
        'reply',
        ...(actions.includes('ASSIGN') ? (['assign'] as const) : []),
        ...(actions.includes('HANDOVER') ? (['handover'] as const) : []),
        'process',
      ]
    : [];
  return (
    <>
      {detail.status === 'RESPONDED' && detail.currentHandler && !actions.includes('PROCEED') ? (
        <p className="action-panel__waiting">
          Menunggu PIC memulai penanganan. Percakapan tetap tersedia.
        </p>
      ) : null}
      {actions.includes('TAKE_OVER') ? (
        <Alert tone="warning" title="PIC sudah tidak aktif">
          <Button variant="primary" onClick={() => open('take-over')}>
            <UserRoundCheck size={18} aria-hidden="true" />
            Ambil alih
          </Button>
        </Alert>
      ) : null}
      <div className="action-panel" role="group" aria-label="Tindakan">
        {!responding && actions.some((action) => ['ASSIGN', 'REASSIGN'].includes(action)) ? (
          <div
            className="action-row action-row--secondary"
            role="group"
            aria-label="Aksi pendukung"
          >
            {actions.includes('ASSIGN') ? (
              <Button variant="secondary" onClick={() => open('assign')}>
                <UserRound size={18} aria-hidden="true" />
                {ACTION_LABELS.ASSIGN}
              </Button>
            ) : null}
            {actions.includes('REASSIGN') ? (
              <Button variant="secondary" onClick={() => open('reassign')}>
                <ArrowLeftRight size={18} aria-hidden="true" />
                {ACTION_LABELS.REASSIGN}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="action-row action-row--primary" role="group" aria-label="Keputusan Voice">
          {!responding && actions.includes('HANDOVER') ? (
            <Button
              variant="secondary"
              onClick={() => void navigate(`/voices/${detail.id}/handover`)}
            >
              <Send size={18} aria-hidden="true" />
              {ACTION_LABELS.HANDOVER}
            </Button>
          ) : null}
          {responding ? (
            <Button variant="primary" onClick={() => open('respond-sheet')}>
              <MessageCircle size={18} aria-hidden="true" />
              Respons
            </Button>
          ) : null}
          {actions.includes('PROCEED') ? (
            <Button variant="primary" onClick={() => open('proceed')}>
              <Play size={18} aria-hidden="true" />
              {ACTION_LABELS.PROCEED}
            </Button>
          ) : null}
          {actions.includes('SET_TARGET') ? (
            <Button variant="primary" onClick={() => open('target')}>
              Tetapkan target baru
            </Button>
          ) : null}
          {actions.includes('CLOSE') ? (
            <Button variant="primary" onClick={() => open('close')}>
              <Check size={18} aria-hidden="true" />
              {ACTION_LABELS.CLOSE}
            </Button>
          ) : null}
        </div>
      </div>
      {notice ? (
        <Alert tone="success" title="Perubahan tersimpan">
          {notice}
        </Alert>
      ) : null}
      <RespondSheet
        open={active === 'respond-sheet'}
        detail={detail}
        choices={choices}
        text={text}
        onText={setText}
        days={days}
        onDays={setDays}
        validDays={validDays}
        loading={pending}
        error={error}
        onCancel={cancel}
        onHandover={() => void navigate(`/voices/${detail.id}/handover`)}
        onConfirm={(choice, handlerAccountId) => {
          const note = text.trim();
          if (choice === 'reply') mutation.mutate({ action: 'respond', note });
          else if (choice === 'process') mutation.mutate({ action: 'respond-process', note });
          else if (choice === 'assign' && handlerAccountId)
            mutation.mutate({
              action: 'assignment-note',
              note,
              assignmentBody: { handlerAccountId },
            });
        }}
      />
      <AssignDialog
        open={active === 'assign' || active === 'reassign'}
        reassign={active === 'reassign'}
        detail={detail}
        onCancel={cancel}
        loading={pending}
        error={error}
        onConfirm={(body) => mutation.mutate({ action: active, assignmentBody: body })}
      />
      <Dialog
        open={active === 'proceed' || active === 'target'}
        onOpenChange={(value) => {
          if (!value) cancel();
        }}
        mobileSheet
        className="assignment-dialog target-dialog"
        title={active === 'proceed' ? 'Mulai penanganan' : 'Tetapkan target baru'}
        description="Tentukan target penyelesaian untuk siklus penanganan ini."
        footer={
          <div className="dialog-actions">
            <Button variant="ghost" disabled={pending} onClick={cancel}>
              Batal
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={!validDays || pending}
              onClick={() => mutation.mutate({ action: active })}
            >
              {active === 'proceed' ? 'Mulai diproses' : 'Simpan target'}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          {error ? (
            <Alert tone="danger" title="Target belum tersimpan">
              {error}
            </Alert>
          ) : null}
          <Input
            label="Target penyelesaian (hari)"
            inputMode="numeric"
            type="number"
            min={0}
            max={365}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            required
            disabled={pending}
            placeholder="Masukkan jumlah hari"
          />
          <TargetPresets days={days} onDays={setDays} disabled={pending} validDays={validDays} />
          <p className="dialog-copy">
            Target tidak dapat diubah dalam siklus ini. Pelapor dan penanggung jawab menerima
            notifikasi; pengingat dikirim sekali jika target terlewati.
          </p>
        </Stack>
      </Dialog>
      <Dialog
        open={active === 'take-over'}
        onOpenChange={(value) => {
          if (!value) cancel();
        }}
        mobileSheet
        title="Ambil alih Voice ini?"
        description="Anda menjadi PIC. Target tidak berubah."
        footer={
          <div className="dialog-actions">
            <Button variant="ghost" disabled={pending} onClick={cancel}>
              Batal
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => mutation.mutate({ action: 'take-over' })}
            >
              Ambil alih
            </Button>
          </div>
        }
      >
        {error ? (
          <Alert tone="danger" title="Belum tersimpan">
            {error}
          </Alert>
        ) : null}
      </Dialog>
      <Dialog
        open={active === 'close'}
        onOpenChange={(value) => {
          if (!value) cancel();
        }}
        mobileSheet
        title="Tutup Voice"
        description="Voice akan ditutup dan status berubah menjadi Selesai."
      >
        {error ? (
          <Alert tone="danger" title="Penutupan belum tersimpan">
            {error}
          </Alert>
        ) : null}
        <CloseDialog
          detail={detail}
          onCancel={cancel}
          onConfirm={(body) => mutation.mutate({ action: 'close', note: body.note })}
          loading={pending}
        />
      </Dialog>
    </>
  );
}

/** Day presets plus the resulting due date; shared by the target dialog and the Respons sheet. */
function TargetPresets({
  days,
  onDays,
  disabled,
  validDays,
}: {
  days: string;
  onDays: (value: string) => void;
  disabled: boolean;
  validDays: boolean;
}) {
  return (
    <>
      <div className="target-presets" role="group" aria-label="Pilihan jumlah hari">
        {[0, 1, 3, 7, 14].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={days === String(value)}
            disabled={disabled}
            onClick={() => onDays(String(value))}
          >
            {value === 0 ? 'Hari ini' : `${value} hari`}
          </button>
        ))}
      </div>
      <div className="target-preview" role="status">
        <span>Target penyelesaian</span>
        <strong>
          {validDays ? formatTargetDate(previewHandlingTarget(Number(days))) : 'Pilih jumlah hari'}
        </strong>
      </div>
    </>
  );
}

/**
 * The single answer sheet for an open Voice: reply, assign a PIC, hand over,
 * or process it yourself. Every option except handover sends the message as
 * the first chat message.
 */
function RespondSheet({
  open,
  detail,
  choices,
  text,
  onText,
  days,
  onDays,
  validDays,
  loading,
  error,
  onCancel,
  onHandover,
  onConfirm,
}: {
  open: boolean;
  detail: VoiceDetail;
  choices: ResponseChoice[];
  text: string;
  onText: (value: string) => void;
  days: string;
  onDays: (value: string) => void;
  validDays: boolean;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onHandover: () => void;
  onConfirm: (choice: ResponseChoice, handlerAccountId?: string) => void;
}) {
  const [choice, setChoice] = useState<ResponseChoice>('reply');
  const [handler, setHandler] = useState('');
  useEffect(() => {
    if (open) {
      setChoice('reply');
      setHandler('');
    }
  }, [open]);
  const hasMessage = text.trim().length > 0;
  const ready =
    choice === 'handover' ||
    (hasMessage &&
      (choice === 'reply' ||
        (choice === 'assign' && Boolean(handler)) ||
        (choice === 'process' && validDays)));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onCancel();
      }}
      mobileSheet
      className="assignment-dialog respond-dialog"
      title="Respons"
      footer={
        <div className="dialog-actions">
          <Button variant="ghost" disabled={loading} onClick={onCancel}>
            Batal
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!ready || loading}
            onClick={() =>
              choice === 'handover' ? onHandover() : onConfirm(choice, handler || undefined)
            }
          >
            {RESPONSE_CHOICES[choice].label}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <div className="respond-choices" role="radiogroup" aria-label="Pilihan respons">
          {choices.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={choice === item}
              className="respond-choice"
              disabled={loading}
              onClick={() => setChoice(item)}
            >
              {RESPONSE_CHOICES[item].icon}
              <span>{RESPONSE_CHOICES[item].label}</span>
            </button>
          ))}
        </div>
        {error ? (
          <Alert tone="danger" title="Respons belum tersimpan">
            {error}
          </Alert>
        ) : null}
        {choice === 'assign' ? (
          <CandidatePicker detail={detail} open={open} selected={handler} onSelect={setHandler} />
        ) : null}
        {choice === 'handover' ? (
          <p className="dialog-copy">Pilih kategori tujuan di langkah berikutnya.</p>
        ) : (
          <Textarea
            label="Pesan"
            placeholder="Tulis pesan untuk pelapor"
            value={text}
            onChange={(event) => onText(event.target.value)}
            rows={3}
            maxLength={4000}
            counter={`${text.length}/4000`}
            required
            disabled={loading}
          />
        )}
        {choice === 'process' ? (
          <TargetPresets days={days} onDays={onDays} disabled={loading} validDays={validDays} />
        ) : null}
      </Stack>
    </Dialog>
  );
}

/**
 * Workload first so it never truncates, then the Section name, which often
 * hints where the Section Head works; the person's name stays the card title.
 */
function candidateDescription(candidate: { activeCount?: number; section?: string | null }) {
  return [
    candidate.activeCount !== undefined ? `${candidate.activeCount} Voice aktif` : null,
    candidate.section ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Searchable PIC list with the incident location, shared by assignment surfaces. */
function CandidatePicker({
  detail,
  open,
  selected,
  onSelect,
}: {
  detail: VoiceDetail;
  open: boolean;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const api = useApi();
  const sessionId = useSessionId();
  const candidates = useQuery({
    queryKey: voiceQuery(sessionId, 'assign-candidates', detail.id),
    queryFn: () => api.assignmentCandidates(detail.id),
    enabled: open,
  });
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const all = candidates.data ?? [];
  const visible = all.filter((candidate) =>
    `${candidate.displayName} ${candidate.section ?? ''}`
      .toLocaleLowerCase('id')
      .includes(search.trim().toLocaleLowerCase('id')),
  );
  return (
    <>
      {detail.visibility === 'GENERAL' ? (
        // Incident location helps the Manager pick the Section Head on duty there.
        <div className="assign-location" aria-label="Lokasi kejadian">
          <MapPin size={18} aria-hidden="true" />
          <div>
            <strong>
              {[AREA_LABELS[detail.area] ?? detail.area, detail.shopLocation?.department]
                .filter(Boolean)
                .join(' · ')}
            </strong>
            {detail.locationDetail ? <small>“{detail.locationDetail}”</small> : null}
          </div>
        </div>
      ) : null}
      {all.length > 5 ? (
        <Input
          label="Cari penanggung"
          placeholder={
            detail.visibility === 'PRIVATE' ? 'Cari nama petugas' : 'Cari nama atau section'
          }
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}
      {candidates.isLoading ? (
        <p className="dialog-copy">Memuat penanggung yang tersedia…</p>
      ) : candidates.isError ? (
        <Alert tone="danger" title="Kandidat gagal dimuat">
          <Button variant="secondary" onClick={() => void candidates.refetch()}>
            Coba lagi
          </Button>
        </Alert>
      ) : all.length === 0 ? (
        <Alert tone="warning" title="Tidak ada penanggung">
          Tidak ada penanggung yang tersedia untuk Voice ini.
        </Alert>
      ) : visible.length === 0 ? (
        <p className="dialog-copy" role="status">
          Tidak ada nama yang cocok. Coba kata pencarian lain.
        </p>
      ) : (
        <>
          {all.length > 5 ? (
            <p className="assignment-count" role="status">
              {visible.length} dari {all.length} penanggung
            </p>
          ) : null}
          <ChoiceCardGroup
            label="Penanggung"
            value={selected}
            onValueChange={onSelect}
            columns={1}
            indicator="radio"
            appearance="brand"
            options={visible.map((candidate) => ({
              value: candidate.id,
              label: candidate.displayName,
              ...(candidateDescription(candidate)
                ? { description: candidateDescription(candidate) }
                : {}),
              icon: <UserRound size={18} />,
            }))}
          />
        </>
      )}
      {detail.visibility === 'PRIVATE' ? (
        <p className="dialog-copy">Hanya Union Officer yang dapat ditugaskan.</p>
      ) : null}
    </>
  );
}

function AssignDialog({
  open,
  reassign,
  error,
  detail,
  onCancel,
  onConfirm,
  loading,
}: {
  open: boolean;
  reassign: boolean;
  error: string | null;
  detail: VoiceDetail;
  onCancel: () => void;
  onConfirm: (body: { handlerAccountId: string; reason?: string }) => void;
  loading: boolean;
}) {
  const api = useApi();
  const sessionId = useSessionId();
  const candidates = useQuery({
    queryKey: voiceQuery(sessionId, 'assign-candidates', detail.id),
    queryFn: () => api.assignmentCandidates(detail.id),
    enabled: open,
  });
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) {
      setSelected('');
      setReason('');
    }
  }, [open]);
  const selectedCandidate = (candidates.data ?? []).find((candidate) => candidate.id === selected);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onCancel();
      }}
      mobileSheet
      className="assignment-dialog"
      title={reassign ? 'Alihkan Penanggung' : 'Tugaskan Penanggung'}
      description={
        detail.visibility === 'PRIVATE'
          ? 'Pilih Union Officer untuk menangani Voice ini.'
          : 'Pilih Section Head untuk menangani Voice ini.'
      }
      footer={
        <div className="assignment-footer">
          {selectedCandidate ? (
            <p className="assignment-footer__selection">
              Dipilih: <strong>{selectedCandidate.displayName}</strong>
            </p>
          ) : null}
          <div className="dialog-actions">
            <Button variant="ghost" disabled={loading} onClick={onCancel}>
              Batal
            </Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={!selectedCandidate || candidates.isError}
              onClick={() => {
                const trimmed = reason.trim();
                onConfirm({ handlerAccountId: selected, ...(trimmed ? { reason: trimmed } : {}) });
              }}
            >
              Tugaskan
            </Button>
          </div>
        </div>
      }
    >
      <Stack gap="md">
        {error ? (
          <Alert tone="danger" title="Penugasan belum tersimpan">
            {error}
          </Alert>
        ) : null}
        <CandidatePicker detail={detail} open={open} selected={selected} onSelect={setSelected} />
        <Textarea
          label="Alasan (opsional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
        />
      </Stack>
    </Dialog>
  );
}

function CloseDialog({
  detail,
  onCancel,
  onConfirm,
  loading,
}: {
  detail: VoiceDetail;
  onCancel: () => void;
  onConfirm: (body: { note: string; version: number }) => void;
  loading: boolean;
}) {
  const api = useApi();
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadEvidence = async (files: FileList) => {
    const room = 5 - evidence.length;
    const picked = Array.from(files).slice(0, room);
    if (!picked.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      const staged: Attachment[] = [];
      for (const file of picked) staged.push(await api.stageEvidence(detail.id, file));
      setEvidence((current) => [...current, ...staged]);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'Gagal mengunggah bukti.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <Stack gap="md">
      <div className="closure-evidence">
        <Textarea
          label="Catatan penyelesaian"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={4000}
          required
          placeholder="Jelaskan tindakan yang telah dilakukan"
        />
        <p className="closure-evidence__label">Foto bukti penyelesaian (opsional)</p>
        <div className="closure-evidence__shelf">
          {evidence.length ? (
            <MediaGallery attachments={evidence} label="Bukti penyelesaian" />
          ) : null}
          <button
            type="button"
            className="closure-evidence__add"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || evidence.length >= 5}
          >
            <ImagePlus size={16} /> Tambah foto
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void uploadEvidence(event.target.files);
          }}
        />
        {uploading ? <p className="dialog-copy">Memproses foto…</p> : null}
        {uploadError ? (
          <Alert tone="danger" title="Bukti gagal">
            {uploadError}
          </Alert>
        ) : null}
        {evidence.length === 0 && !uploading ? (
          <p className="dialog-copy">Tambahkan hingga 5 foto bila diperlukan.</p>
        ) : null}
        <p className="closure-evidence__privacy">
          <Lock size={14} aria-hidden="true" /> Catatan dan bukti akan terlihat oleh pelapor.
        </p>
      </div>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={!note.trim() || uploading}
          onClick={() => onConfirm({ note, version: detail.version })}
        >
          Tutup Voice
        </Button>
      </div>
    </Stack>
  );
}
