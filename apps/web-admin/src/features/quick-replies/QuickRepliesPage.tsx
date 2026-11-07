import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  Input,
  Select,
  Stack,
  Switch,
  Textarea,
} from '@care/ui';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type AdminQuickReply, type AdminQuickReplyList } from '../../admin-api';

type Placement = AdminQuickReply['placement'];
const PLACES: { value: Placement; label: string }[] = [
  { value: 'REPLY', label: 'Respons · Balas pesan' },
  { value: 'PROCESS', label: 'Respons · Proses sendiri' },
  { value: 'ASSIGN', label: 'Respons · Tugaskan PIC' },
  { value: 'ESCALATE', label: 'Respons · Naikkan ke atasan' },
  { value: 'HANDOVER', label: 'Handover' },
  { value: 'CLOSE', label: 'Selesaikan Voice' },
];
const LIMIT = 10;

type Draft = { placement: Placement; label: string; text: string; active: boolean };
type Editor = { mode: 'create' } | { mode: 'edit'; item: AdminQuickReply };

/**
 * CARE Admin: Jawaban Cepat, the ready-made sentences responders tap while
 * responding, handing over and finishing a Voice.
 */
export function QuickRepliesPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const key = careQueryKey(session?.sessionId ?? 'anon', 'quick-replies');
  const [place, setPlace] = useState<Placement>('REPLY');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<Draft>({
    placement: 'REPLY',
    label: '',
    text: '',
    active: true,
  });

  const q = useQuery({ queryKey: key, queryFn: api.quickReplies, enabled: !!session });
  const store = (next: AdminQuickReplyList) => qc.setQueryData(key, next);
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...draft, label: draft.label.trim(), text: draft.text.trim() };
      return editor?.mode === 'edit'
        ? api.updateQuickReply(editor.item.id, { ...body, expectedVersion: editor.item.version })
        : api.createQuickReply(body);
    },
    onSuccess: (next) => {
      store(next);
      setPlace(draft.placement);
      setEditor(null);
    },
    onError: refresh,
  });
  const toggle = useMutation({
    mutationFn: (item: AdminQuickReply) =>
      api.updateQuickReply(item.id, {
        placement: item.placement,
        label: item.label,
        text: item.text,
        active: !item.active,
        expectedVersion: item.version,
      }),
    onSuccess: store,
    onError: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderQuickReplies({ placement: place, ids }),
    onSuccess: store,
    onError: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteQuickReply(id),
    onSuccess: refresh,
  });

  const all = q.data?.items ?? [];
  const items = all.filter((item) => item.placement === place);
  const placeLabel = PLACES.find((option) => option.value === place)?.label ?? place;
  const open = (next: Editor) => {
    setEditor(next);
    setDraft(
      next.mode === 'edit'
        ? {
            placement: next.item.placement,
            label: next.item.label,
            text: next.item.text,
            active: next.item.active,
          }
        : { placement: place, label: '', text: '', active: true },
    );
    save.reset();
  };
  const move = (index: number, offset: number) => {
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    reorder.mutate(ids);
  };
  const targetCount = all.filter(
    (item) =>
      item.placement === draft.placement && (editor?.mode !== 'edit' || item.id !== editor.item.id),
  ).length;
  const full = targetCount >= LIMIT;
  const canSave = !!draft.label.trim() && !!draft.text.trim() && !full;
  const actionError = toggle.error ?? reorder.error ?? remove.error;

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Responder"
        title="Jawaban Cepat"
        description="Kalimat siap pakai yang bisa dipilih responder saat merespons, handover, dan menyelesaikan Voice."
        actions={
          <Button onClick={() => open({ mode: 'create' })}>
            <Plus size={16} /> Tambah jawaban cepat
          </Button>
        }
      />
      {q.isLoading ? (
        <AdminSkeleton lines={5} label="Memuat jawaban cepat" />
      ) : q.error ? (
        <Alert tone="danger" title="Gagal memuat">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <div className="qrset">
          <nav className="admin-table-card qrset__places" aria-label="Tempat jawaban cepat">
            {PLACES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-current={place === option.value ? 'true' : undefined}
                onClick={() => setPlace(option.value)}
              >
                <span>{option.label}</span>
                <small>{all.filter((item) => item.placement === option.value).length}</small>
              </button>
            ))}
          </nav>
          <section className="admin-table-card qrset__card" aria-label={placeLabel}>
            <div className="qrset__preview">
              <span className="qrset__preview-label">
                <Zap size={14} aria-hidden="true" /> Tampilan di aplikasi
              </span>
              {items.some((item) => item.active) ? (
                <div className="qrset__chips">
                  {items
                    .filter((item) => item.active)
                    .map((item) => (
                      <span key={item.id}>{item.label}</span>
                    ))}
                </div>
              ) : (
                <p className="admin-meta--xs">Tidak ada yang tampil di tempat ini.</p>
              )}
            </div>
            {items.length ? (
              <ul className="qrset__list">
                {items.map((item, index) => (
                  <li key={item.id} data-inactive={item.active ? undefined : 'true'}>
                    <span className="qrset__order">
                      <IconButton
                        aria-label={`Naikkan ${item.label}`}
                        variant="ghost"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        aria-label={`Turunkan ${item.label}`}
                        variant="ghost"
                        disabled={index === items.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                    </span>
                    <span className="qrset__body">
                      <strong>{item.label}</strong>
                      <small>{item.text}</small>
                    </span>
                    <Switch
                      label="Aktif"
                      checked={item.active}
                      disabled={toggle.isPending}
                      onCheckedChange={() => toggle.mutate(item)}
                    />
                    <IconButton
                      aria-label={`Ubah ${item.label}`}
                      variant="ghost"
                      onClick={() => open({ mode: 'edit', item })}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <ConfirmDialog
                      trigger={
                        <IconButton aria-label={`Hapus ${item.label}`} variant="ghost">
                          <Trash2 size={15} />
                        </IconButton>
                      }
                      title={`Hapus ${item.label}?`}
                      description="Jawaban cepat ini tidak lagi muncul untuk responder."
                      confirmLabel="Hapus"
                      destructive
                      loading={remove.isPending}
                      onConfirm={() => remove.mutate(item.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <AdminEmpty
                title="Belum ada jawaban cepat"
                description="Tambahkan kalimat yang sering dipakai responder di tempat ini."
              />
            )}
          </section>
        </div>
      )}
      {actionError ? (
        <Alert tone="danger" title="Perubahan gagal disimpan">
          {String((actionError as Error).message)}
        </Alert>
      ) : null}
      <Dialog
        open={!!editor}
        onOpenChange={(next) => !next && setEditor(null)}
        title={editor?.mode === 'edit' ? 'Ubah jawaban cepat' : 'Tambah jawaban cepat'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Batal
            </Button>
            <Button loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
              Simpan
            </Button>
          </>
        }
      >
        <Stack gap="sm">
          <Select
            label="Tempat"
            value={draft.placement}
            onValueChange={(value) => setDraft({ ...draft, placement: value as Placement })}
            options={PLACES}
          />
          <Input
            label="Nama"
            value={draft.label}
            maxLength={30}
            placeholder="mis. Sudah diperbaiki"
            helperText={`${draft.label.length}/30 · tampil sebagai tombol`}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          />
          <Textarea
            label="Isi"
            value={draft.text}
            rows={4}
            maxLength={500}
            counter={`${draft.text.length}/500`}
            placeholder="Kalimat lengkap yang masuk ke kolom isian"
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          />
          <Switch
            label="Aktif"
            checked={draft.active}
            onCheckedChange={(active) => setDraft({ ...draft, active })}
          />
          {full ? (
            <Alert tone="warning" title="Tempat ini sudah penuh">
              Maksimal {LIMIT} jawaban cepat per tempat.
            </Alert>
          ) : null}
          {save.error ? (
            <Alert tone="danger" title="Gagal menyimpan">
              {String((save.error as Error).message)}
            </Alert>
          ) : null}
        </Stack>
      </Dialog>
    </Stack>
  );
}
