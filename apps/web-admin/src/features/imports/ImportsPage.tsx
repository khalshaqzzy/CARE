import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  FileUpload,
  Loader,
  PageHeader,
  Stack,
  Pagination,
  Dialog,
  Tabs,
} from '@care/ui';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type ImportPreview = {
  id: string;
  checksum: string;
  version: number;
  expiresAt: string;
  status: string;
  summary: {
    rowCount: number;
    unitCount: number;
    create: number;
    update: number;
    deactivate: number;
    unchanged: number;
    routeGaps: unknown[];
    department14Rows: number;
  };
  errors: Array<{ code: string; message: string; row?: number | null }>;
  createdAt: string;
};

export function ImportsPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const cursor = searchParams.get('cursor') ?? undefined;
  const [file, setFile] = useState<File | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const list = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'list', cursor ?? 'first'),
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/admin/organization-imports?limit=20${cursor ? `&cursor=${cursor}` : ''}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Gagal memuat imports');
      return (await res.json()) as { items: ImportPreview[]; nextCursor: string | null };
    },
    enabled: !!session,
  });

  const detail = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'detail', previewId ?? 'none'),
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/organization-imports/${previewId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Gagal memuat detail');
      return (await res.json()) as ImportPreview;
    },
    enabled: !!previewId && !!session,
  });

  const changes = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'changes', previewId ?? 'none'),
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/organization-imports/${previewId}/changes?limit=20`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Gagal memuat changes');
      return (await res.json()) as {
        items: Array<{ noReg: string; type: string }>;
        nextCursor: string | null;
        total: number;
      };
    },
    enabled: !!previewId && !!session,
  });

  const snapshot = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'snapshot'),
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/organization-snapshots/current', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Gagal memuat snapshot');
      return (await res.json()) as unknown;
    },
    enabled: !!session,
  });

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/v1/admin/organization-imports/preview', {
        method: 'POST',
        credentials: 'include',
        body: fd,
        headers: { 'X-CSRF-Token': await getCsrf() },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Preview gagal');
      }
      return (await res.json()) as ImportPreview;
    },
    onSuccess: (data) => {
      setPreviewId(data.id);
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'list'),
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!detail.data) throw new Error('Tidak ada preview');
      const res = await fetch(`/api/v1/admin/organization-imports/${detail.data.id}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrf(),
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          checksum: detail.data.checksum,
          expectedVersion: detail.data.version,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Confirm gagal');
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmOpen(false);
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'list'),
      });
    },
  });

  async function getCsrf() {
    const r = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const j = (await r.json()) as { token: string };
    return j.token;
  }

  // polling only while queued/processing
  useEffect(() => {
    if (detail.data?.status === 'QUEUED' || detail.data?.status === 'PROCESSING') {
      const id = setInterval(() => void detail.refetch(), 2000);
      return () => clearInterval(id);
    }
  }, [detail.data?.status, detail]);

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Master Data"
        title="Import & Master Data"
        description="Unggah file .xlsx atau .csv authoritative 10 MB, preview, dan konfirmasi."
      />
      <Card>
        <Stack gap="md">
          <FileUpload
            label="Unggah file organisasi"
            accept=".xlsx,.csv"
            maxFiles={1}
            onFilesAdded={(files) => setFile(files[0] ?? null)}
          />
          {file ? (
            <p style={{ fontSize: '0.875rem' }}>
              Terpilih: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}
          <Button
            onClick={() => file && previewMutation.mutate(file)}
            loading={previewMutation.isPending}
            disabled={!file}
          >
            Preview
          </Button>
          {previewMutation.error ? (
            <Alert tone="danger" title="Gagal preview">
              {String((previewMutation.error as Error).message)}
            </Alert>
          ) : null}
        </Stack>
      </Card>

      {detail.data ? (
        <Card>
          <Stack gap="md">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge
                tone={
                  detail.data.status === 'CONFIRMED'
                    ? 'success'
                    : detail.data.status === 'FAILED'
                      ? 'danger'
                      : 'info'
                }
              >
                {detail.data.status}
              </Badge>
              <span style={{ fontSize: '0.875rem' }}>
                Checksum {detail.data.checksum.slice(0, 12)} • v{detail.data.version} • exp{' '}
                {new Date(detail.data.expiresAt).toLocaleString('id-ID')}
              </span>
            </div>
            <div
              className="care-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem' }}
            >
              <div>
                <strong>{detail.data.summary.rowCount}</strong>
                <div style={{ fontSize: '0.75rem' }}>Rows</div>
              </div>
              <div>
                <strong>{detail.data.summary.create}</strong>
                <div style={{ fontSize: '0.75rem' }}>Create</div>
              </div>
              <div>
                <strong>{detail.data.summary.update}</strong>
                <div style={{ fontSize: '0.75rem' }}>Update</div>
              </div>
              <div>
                <strong>{detail.data.summary.deactivate}</strong>
                <div style={{ fontSize: '0.75rem' }}>Deactivate</div>
              </div>
              <div>
                <strong>{detail.data.summary.department14Rows}</strong>
                <div style={{ fontSize: '0.75rem' }}>Dept 14</div>
              </div>
            </div>
            {detail.data.errors?.length ? (
              <Alert
                tone={
                  detail.data.errors.some((e) => e.code === 'DUPLICATE_DEPARTMENT_HEAD')
                    ? 'danger'
                    : 'warning'
                }
                title="Blocking validation"
              >
                {detail.data.errors.map((e) => `${e.code}: ${e.message}`).join(' • ')}
              </Alert>
            ) : null}
            {detail.data.status === 'PREVIEWED' ? (
              <Button onClick={() => setConfirmOpen(true)} variant="primary">
                Konfirmasi import
              </Button>
            ) : null}
            {detail.data.status === 'QUEUED' || detail.data.status === 'PROCESSING' ? (
              <Loader label="Memproses import" />
            ) : null}
            {detail.data.status === 'CONFIRMED' ? (
              <Alert tone="success" title="Berhasil">
                Import telah dikonfirmasi.
              </Alert>
            ) : null}
            {detail.data.status === 'FAILED' ? (
              <Alert tone="danger" title="Gagal">
                Import gagal diproses.
              </Alert>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      {changes.data ? (
        <Card>
          <Stack gap="sm">
            <strong>Perubahan ({changes.data.total})</strong>
            <DataTable
              columns={[
                { key: 'noReg', header: 'NoReg', cell: (r: { noReg: string }) => r.noReg },
                {
                  key: 'type',
                  header: 'Tipe',
                  cell: (r: { type: string }) => (
                    <Badge
                      tone={
                        r.type === 'CREATE'
                          ? 'success'
                          : r.type === 'DEACTIVATE'
                            ? 'danger'
                            : 'info'
                      }
                    >
                      {r.type}
                    </Badge>
                  ),
                },
              ]}
              rows={changes.data.items as never}
              rowKey={(r: { noReg: string; type: string }) => `${r.noReg}-${r.type}`}
              empty={<span>Tidak ada perubahan</span>}
            />
            {changes.data.nextCursor ? (
              <p style={{ fontSize: '0.75rem' }}>Ada data lanjutan (cursor)</p>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      <Tabs
        label="Import tabs"
        defaultValue="history"
        items={[
          {
            value: 'history',
            label: 'History',
            content: (
              <Stack gap="sm">
                {list.isLoading ? (
                  <Loader label="Memuat history" />
                ) : list.error ? (
                  <Alert tone="danger" title="Gagal">
                    {String((list.error as Error).message)}
                  </Alert>
                ) : (
                  <>
                    <DataTable
                      columns={[
                        { key: 'id', header: 'ID', cell: (r: ImportPreview) => r.id.slice(0, 8) },
                        {
                          key: 'status',
                          header: 'Status',
                          cell: (r: ImportPreview) => (
                            <Badge tone={r.status === 'CONFIRMED' ? 'success' : 'info'}>
                              {r.status}
                            </Badge>
                          ),
                        },
                        {
                          key: 'rowCount',
                          header: 'Rows',
                          cell: (r: ImportPreview) =>
                            String((r.summary as { rowCount: number }).rowCount),
                        },
                        {
                          key: 'createdAt',
                          header: 'Dibuat',
                          cell: (r: ImportPreview) => new Date(r.createdAt).toLocaleString('id-ID'),
                        },
                      ]}
                      rows={(list.data?.items ?? []) as never}
                      rowKey={(r: ImportPreview) => r.id}
                      empty={<span>Belum ada import</span>}
                    />
                    <Pagination
                      page={1}
                      pageCount={list.data?.nextCursor ? 2 : 1}
                      onPageChange={(p) =>
                        setSearchParams(
                          p === 2 && list.data?.nextCursor ? { cursor: list.data.nextCursor } : {},
                        )
                      }
                    />
                  </>
                )}
              </Stack>
            ),
          },
          {
            value: 'snapshot',
            label: 'Snapshot aktif',
            content: snapshot.isLoading ? (
              <Loader label="Memuat snapshot" />
            ) : (
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(snapshot.data, null, 2)}
              </pre>
            ),
          },
        ]}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Konfirmasi import"
        description="Tindakan ini akan menonaktifkan akun yang hilang dan memperbarui route. Deaktivasi ditonjolkan."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              variant="primary"
            >
              Ya, konfirmasi
            </Button>
          </>
        }
      >
        <Alert tone="warning" title="Perhatikan deactivation">
          {detail.data
            ? `${detail.data.summary.deactivate} akun akan dinonaktifkan. Pastikan sudah benar.`
            : 'Pastikan file sudah benar.'}
        </Alert>
        {confirmMutation.error ? (
          <Alert tone="danger" title="Gagal">
            {String((confirmMutation.error as Error).message)}
          </Alert>
        ) : null}
      </Dialog>
    </Stack>
  );
}
