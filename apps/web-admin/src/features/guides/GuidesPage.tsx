import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  FileUpload,
  IconButton,
  Input,
  Stack,
} from '@care/ui';
import { ArrowDown, ArrowUp, FileText, PlayCircle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type AdminGuide } from '../../admin-api';

const MAX_BYTES = 20_000_000;

function sizeLabel(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1000)} KB`;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Editor = { mode: 'create'; kind: 'PDF' | 'VIDEO' } | { mode: 'edit'; guide: AdminGuide };

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/** CARE Admin: PDF and video-link guides shown in the workforce Panduan page by audience. */
export function GuidesPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const key = careQueryKey(session?.sessionId ?? 'anon', 'guides');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useState('');
  const [forMember, setForMember] = useState(true);
  const [forResponder, setForResponder] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  const q = useQuery({ queryKey: key, queryFn: api.guides, enabled: !!session });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: async () => {
      if (editor?.mode === 'edit') {
        const updated = await api.updateGuide(editor.guide.id, {
          title: title.trim(),
          forMember,
          forResponder,
          ...(editor.guide.kind === 'VIDEO' ? { videoUrl: videoUrl.trim() } : {}),
        });
        return file ? api.replaceGuideFile(editor.guide.id, file) : updated;
      }
      if (editor?.kind === 'VIDEO')
        return api.createVideoGuide({
          title: title.trim(),
          videoUrl: videoUrl.trim(),
          forMember,
          forResponder,
        });
      return api.createGuide({ file: file!, title: title.trim(), forMember, forResponder });
    },
    onSuccess: () => {
      setEditor(null);
      refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderGuides(ids),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteGuide(id),
    onSuccess: refresh,
  });

  const open = (next: Editor) => {
    setEditor(next);
    setTitle(next.mode === 'edit' ? next.guide.title : '');
    setForMember(next.mode === 'edit' ? next.guide.forMember : true);
    setForResponder(next.mode === 'edit' ? next.guide.forResponder : false);
    setFile(null);
    setVideoUrl(next.mode === 'edit' ? (next.guide.videoUrl ?? '') : '');
    save.reset();
  };
  const items = q.data?.items ?? [];
  const move = (index: number, offset: number) => {
    const ids = items.map((guide) => guide.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    reorder.mutate(ids);
  };
  const isVideo =
    editor?.mode === 'edit' ? editor.guide.kind === 'VIDEO' : editor?.kind === 'VIDEO';
  const tooLarge = !!file && file.size > MAX_BYTES;
  const canSave =
    !!title.trim() &&
    (forMember || forResponder) &&
    (isVideo ? isHttpsUrl(videoUrl.trim()) : !tooLarge && (editor?.mode === 'edit' || !!file));

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Konten"
        title="Panduan"
        description="PDF dan video yang tampil di menu Panduan aplikasi CARE, sesuai peran akun."
        actions={
          <span className="admin-guide-actions">
            <Button variant="secondary" onClick={() => open({ mode: 'create', kind: 'VIDEO' })}>
              <PlayCircle size={16} /> Tambah video
            </Button>
            <Button onClick={() => open({ mode: 'create', kind: 'PDF' })}>
              <Plus size={16} /> Upload PDF
            </Button>
          </span>
        }
      />
      {q.isLoading ? (
        <AdminSkeleton lines={4} label="Memuat panduan" />
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card" aria-label="Daftar panduan">
          <DataTable
            caption="Panduan sesuai urutan tampil"
            columns={[
              {
                key: 'order',
                header: 'Urutan',
                cell: (g: AdminGuide) => {
                  const index = items.findIndex((item) => item.id === g.id);
                  return (
                    <span className="admin-guide-order">
                      <IconButton
                        aria-label={`Naikkan ${g.title}`}
                        variant="ghost"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        aria-label={`Turunkan ${g.title}`}
                        variant="ghost"
                        disabled={index === items.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                    </span>
                  );
                },
              },
              {
                key: 'title',
                header: 'Judul',
                cell: (g: AdminGuide) => (
                  <span>
                    <strong>{g.title}</strong>
                    <br />
                    {g.kind === 'VIDEO' ? (
                      <a
                        className="admin-meta--xs admin-guide-file"
                        href={g.videoUrl ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <PlayCircle size={12} aria-hidden="true" /> Video · {g.videoUrl}
                      </a>
                    ) : (
                      <a
                        className="admin-meta--xs admin-guide-file"
                        href={`/api/v1/guides/${g.id}/file`}
                        target="_blank"
                        rel="noopener"
                      >
                        <FileText size={12} aria-hidden="true" /> {g.fileName} ·{' '}
                        {sizeLabel(g.size ?? 0)}
                      </a>
                    )}
                  </span>
                ),
              },
              {
                key: 'audience',
                header: 'Tampil untuk',
                cell: (g: AdminGuide) => (
                  <span className="admin-guide-audience">
                    {g.forMember ? <Badge tone="info">Member</Badge> : null}
                    {g.forResponder ? <Badge tone="success">Responder</Badge> : null}
                  </span>
                ),
              },
              {
                key: 'updated',
                header: 'Diperbarui',
                cell: (g: AdminGuide) => (
                  <span>
                    {dateLabel(g.updatedAt)}
                    <br />
                    <span className="admin-meta--xs">{g.uploadedBy.displayName}</span>
                  </span>
                ),
              },
              {
                key: 'action',
                header: '',
                cell: (g: AdminGuide) => (
                  <span className="admin-guide-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => open({ mode: 'edit', guide: g })}
                    >
                      Ubah
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Hapus
                        </Button>
                      }
                      title={`Hapus ${g.title}?`}
                      description="Panduan hilang dari semua akun."
                      confirmLabel="Hapus"
                      destructive
                      loading={remove.isPending}
                      onConfirm={() => remove.mutate(g.id)}
                    />
                  </span>
                ),
              },
            ]}
            rows={items as never}
            rowKey={(g: AdminGuide) => g.id}
            empty={
              <AdminEmpty
                title="Belum ada panduan"
                description="Upload PDF atau tambah video agar tampil di menu Panduan."
              />
            }
          />
        </section>
      )}
      {reorder.error || remove.error ? (
        <Alert tone="danger" title="Gagal">
          {String(((reorder.error ?? remove.error) as Error).message)}
        </Alert>
      ) : null}
      <Dialog
        open={!!editor}
        onOpenChange={(next) => !next && setEditor(null)}
        title={editor?.mode === 'edit' ? 'Ubah panduan' : isVideo ? 'Tambah video' : 'Upload PDF'}
        description={
          isVideo ? 'Link YouTube, Google Drive atau SharePoint.' : 'PDF, maksimal 20 MB.'
        }
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
          <Input
            label="Judul"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isVideo ? 'Video cara submit Voice' : 'Panduan Submit Voice'}
          />
          {isVideo ? (
            <Input
              label="Link video"
              type="url"
              value={videoUrl}
              maxLength={500}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/…"
              {...(videoUrl.trim() && !isHttpsUrl(videoUrl.trim())
                ? { errorText: 'Link harus diawali https://' }
                : {})}
            />
          ) : null}
          <fieldset className="admin-guide-audience-field">
            <legend>Tampil untuk</legend>
            <Checkbox
              label="Member"
              description="Semua karyawan yang bisa membuat Voice"
              checked={forMember}
              onCheckedChange={setForMember}
            />
            <Checkbox
              label="Responder"
              description="GL, SH, Manager, Division, Director, Komite"
              checked={forResponder}
              onCheckedChange={setForResponder}
            />
          </fieldset>
          {isVideo ? null : (
            <FileUpload
              label={editor?.mode === 'edit' ? 'Ganti file PDF (opsional)' : 'Pilih file PDF'}
              accept="application/pdf,.pdf"
              maxFiles={1}
              onFilesAdded={(files) => setFile(files[0] ?? null)}
            />
          )}
          {file ? (
            <p className="admin-meta">
              <FileText size={14} aria-hidden="true" /> {file.name} ({sizeLabel(file.size)})
            </p>
          ) : null}
          {tooLarge ? (
            <Alert tone="danger" title="File terlalu besar">
              Ukuran PDF maksimal 20 MB.
            </Alert>
          ) : null}
          {save.error ? (
            <Alert tone="danger" title="Gagal">
              {String((save.error as Error).message)}
            </Alert>
          ) : null}
        </Stack>
      </Dialog>
    </Stack>
  );
}
