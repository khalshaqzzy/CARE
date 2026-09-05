import { Alert, Button, ChoiceCardGroup, Dialog, Input, Stack, Textarea } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  ImagePlus,
  Lock,
  MessagesSquare,
  Play,
  Send,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTION_LABELS } from '../lib/formatters';
import { useApi, useMutationKey, useSessionId, voiceQuery } from '../lib/query';
import type { Attachment, VoiceDetail } from '../workforce-api';
import { MediaGallery } from './MediaGallery';

type Action = 'ask' | 'proceed' | 'close' | 'rate' | 'assign' | 'reassign' | 'none';

export function ActionPanel({ detail }: { detail: VoiceDetail }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const actions = detail.availableActions ?? [];
  const [active, setActive] = useState<Action>('none');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const askKey = useMutationKey('ask');
  const proceedKey = useMutationKey('proceed');
  const closeKey = useMutationKey('close');
  const assignKey = useMutationKey('assign');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', detail.id) });
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
  };

  const ask = useMutation({
    mutationFn: async (text: string) =>
      api.ask(detail.id, { text, version: detail.version }, askKey.key()),
    // PRD §16: asking opens and focuses the verification room.
    onSuccess: () => {
      invalidate();
      void navigate(`/voices/${detail.id}/chat`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: askKey.reset,
  });
  const proceed = useMutation({
    mutationFn: () => api.proceed(detail.id, { version: detail.version }, proceedKey.key()),
    onSuccess: () => {
      invalidate();
      setNotice('Voice dipindahkan ke In Progress.');
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: proceedKey.reset,
  });
  const close = useMutation({
    mutationFn: (body: { note: string; version: number }) =>
      api.close(detail.id, body, closeKey.key()),
    onSuccess: () => {
      invalidate();
      setNotice('Voice berhasil ditutup. Percakapan kini hanya dapat dibaca.');
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: closeKey.reset,
  });
  const assign = useMutation({
    mutationFn: (body: { handlerAccountId: string; reason?: string }) =>
      api.assign(detail.id, { ...body, expectedVersion: detail.version }, assignKey.key()),
    onSuccess: () => {
      invalidate();
      setNotice('Penanggung jawab diperbarui dan percakapan verifikasi tersedia.');
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: assignKey.reset,
  });

  if (!actions.length) return null;

  return (
    <>
      <div className="action-panel" role="group" aria-label="Tindakan">
        {actions.some((action) => ['ASSIGN', 'REASSIGN', 'ASK'].includes(action)) ? (
          <div
            className="action-row action-row--secondary"
            role="group"
            aria-label="Aksi pendukung"
          >
            {actions.includes('ASSIGN') ? (
              <Button variant="secondary" onClick={() => setActive('assign')}>
                <UserRound size={18} aria-hidden="true" />
                {ACTION_LABELS.ASSIGN}
              </Button>
            ) : null}
            {actions.includes('REASSIGN') ? (
              <Button variant="secondary" onClick={() => setActive('reassign')}>
                <ArrowLeftRight size={18} aria-hidden="true" />
                {ACTION_LABELS.REASSIGN}
              </Button>
            ) : null}
            {actions.includes('ASK') ? (
              <Button variant="secondary" onClick={() => setActive('ask')}>
                <MessagesSquare size={18} aria-hidden="true" />
                {ACTION_LABELS.ASK}
              </Button>
            ) : null}
          </div>
        ) : null}
        {actions.some((action) => ['HANDOVER', 'PROCEED', 'CLOSE'].includes(action)) ? (
          <div className="action-row action-row--primary" role="group" aria-label="Keputusan Voice">
            {actions.includes('HANDOVER') ? (
              <Button
                variant="secondary"
                onClick={() => void navigate(`/voices/${detail.id}/handover`)}
              >
                <Send size={18} aria-hidden="true" />
                {ACTION_LABELS.HANDOVER}
              </Button>
            ) : null}
            {actions.includes('PROCEED') ? (
              <Button variant="primary" onClick={() => setActive('proceed')}>
                <Play size={18} aria-hidden="true" />
                {ACTION_LABELS.PROCEED}
              </Button>
            ) : null}
            {actions.includes('CLOSE') ? (
              <Button variant="primary" onClick={() => setActive('close')}>
                <Check size={18} aria-hidden="true" />
                {ACTION_LABELS.CLOSE}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <Alert tone="danger" title="Periksa kembali">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" title="Perubahan tersimpan">
          {notice}
        </Alert>
      ) : null}

      <Dialog
        open={active === 'ask'}
        onOpenChange={(open) => setActive(open ? 'ask' : 'none')}
        title="Tanya Reporter"
        description="Kirim pertanyaan verifikasi. Status akan berpindah ke In Verification."
      >
        <AskDialog
          onCancel={() => setActive('none')}
          onSend={(text) => ask.mutate(text)}
          loading={ask.isPending}
        />
      </Dialog>

      <AssignDialog
        open={active === 'assign' || active === 'reassign'}
        reassign={active === 'reassign'}
        detail={detail}
        onCancel={() => setActive('none')}
        onConfirm={(body) => assign.mutate(body)}
        loading={assign.isPending}
        error={
          assign.isError
            ? assign.error instanceof Error
              ? assign.error.message
              : 'Penugasan gagal. Coba lagi.'
            : null
        }
      />

      <Dialog
        open={active === 'proceed'}
        onOpenChange={(open) => setActive(open ? 'proceed' : 'none')}
        title="Proses Voice"
        description="Konfirmasi Anda menangani Voice ini dan memindahkannya ke In Progress."
      >
        <ProceedDialog
          onCancel={() => setActive('none')}
          onConfirm={() => proceed.mutate()}
          loading={proceed.isPending}
        />
      </Dialog>

      <Dialog
        open={active === 'close'}
        onOpenChange={(open) => setActive(open ? 'close' : 'none')}
        mobileSheet
        title="Tutup Voice"
        description="Voice akan ditutup dan status berubah menjadi Selesai."
      >
        <CloseDialog
          detail={detail}
          onCancel={() => setActive('none')}
          onConfirm={(body) => close.mutate(body)}
          loading={close.isPending}
        />
      </Dialog>
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
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) {
      setSelected('');
      setReason('');
      setSearch('');
    }
  }, [open]);
  const all = candidates.data ?? [];
  const visible = all.filter((candidate) =>
    candidate.displayName.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id')),
  );
  const selectedCandidate = all.find((candidate) => candidate.id === selected);
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
        {all.length > 5 ? (
          <Input
            label="Cari penanggung"
            placeholder={
              detail.visibility === 'PRIVATE' ? 'Cari nama petugas' : 'Cari nama Section Head'
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
              onValueChange={setSelected}
              columns={1}
              indicator="radio"
              appearance="brand"
              options={visible.map((candidate) => ({
                value: candidate.id,
                label: candidate.displayName,
                ...(candidate.activeCount !== undefined
                  ? { description: `${candidate.activeCount} Voice aktif` }
                  : {}),
                icon: <UserRound size={18} />,
              }))}
            />
          </>
        )}
        {detail.visibility === 'PRIVATE' ? (
          <p className="dialog-copy">Hanya Union Officer yang dapat ditugaskan.</p>
        ) : null}
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

function AskDialog({
  onCancel,
  onSend,
  loading,
}: {
  onCancel: () => void;
  onSend: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Stack gap="md">
      <Textarea
        label="Pesan pertanyaan"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        maxLength={4000}
        required
      />
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={!text.trim()}
          onClick={() => onSend(text)}
        >
          Kirim
        </Button>
      </div>
    </Stack>
  );
}

function ProceedDialog({
  onCancel,
  onConfirm,
  loading,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Stack gap="md">
      <p className="dialog-copy">
        Voice akan berpindah ke In Progress dan Anda menjadi penanggung jawab aktif.
      </p>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button variant="primary" loading={loading} onClick={onConfirm}>
          Proses
        </Button>
      </div>
    </Stack>
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
