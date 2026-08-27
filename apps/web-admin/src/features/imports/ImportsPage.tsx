import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
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
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createAdminApi, type ImportPreview } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

export function ImportsPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pagination = cursorPagination(searchParams, setSearchParams);
  const [file, setFile] = useState<File | null>(null);
  const previewId = searchParams.get('previewId');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKey, setConfirmKey] = useState('');
  const [changeCursor, setChangeCursor] = useState<string | undefined>();
  const [changeHistory, setChangeHistory] = useState<string[]>([]);
  const [changeFilter, setChangeFilter] = useState('');

  const list = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'imports',
      'list',
      pagination.cursor ?? 'first',
    ),
    queryFn: () => api.imports({ limit: 20, cursor: pagination.cursor }),
    enabled: !!session,
  });

  const detail = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'detail', previewId ?? 'none'),
    queryFn: () => api.importDetail(previewId!),
    enabled: !!previewId && !!session,
    refetchInterval: (query) =>
      query.state.data?.status === 'QUEUED' || query.state.data?.status === 'PROCESSING'
        ? 2_000
        : false,
  });

  const changes = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'imports',
      'changes',
      previewId ?? 'none',
      changeFilter,
      changeCursor ?? 'first',
    ),
    queryFn: () =>
      api.importChanges(previewId!, {
        limit: 20,
        cursor: changeCursor,
        filter: changeFilter || undefined,
      }),
    enabled: !!previewId && !!session,
  });

  const snapshot = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'snapshot'),
    queryFn: api.currentSnapshot,
    enabled: !!session,
  });

  const previewMutation = useMutation({
    mutationFn: api.previewImport,
    onSuccess: (data) => {
      const params = new URLSearchParams(searchParams);
      params.set('previewId', data.id);
      setSearchParams(params);
      setChangeCursor(undefined);
      setChangeHistory([]);
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'list'),
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!detail.data) throw new Error('Tidak ada preview');
      return api.confirmImport(
        detail.data.id,
        {
          checksum: detail.data.checksum,
          expectedVersion: detail.data.version,
        },
        confirmKey,
      );
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      await qc.invalidateQueries({
        queryKey: careQueryKey(
          session?.sessionId ?? 'anon',
          'imports',
          'detail',
          previewId ?? 'none',
        ),
      });
      await qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'imports', 'list'),
      });
    },
  });

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
                {detail.data.errors
                  .map((e) => `${String(e.code)}: ${String(e.message ?? '')}`)
                  .join(' • ')}
              </Alert>
            ) : null}
            {detail.data.status === 'PREVIEWED' ? (
              <Button
                onClick={() => {
                  setConfirmKey(crypto.randomUUID());
                  setConfirmOpen(true);
                }}
                variant="primary"
                disabled={Boolean(detail.data.errors?.length)}
              >
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
            <Tabs
              label="Filter perubahan"
              defaultValue={changeFilter || 'ALL'}
              items={['ALL', 'CREATE', 'UPDATE', 'UNCHANGED', 'DEACTIVATE'].map((value) => ({
                value,
                label: value,
                content: null,
              }))}
              onValueChange={(value) => {
                setChangeFilter(value === 'ALL' ? '' : value);
                setChangeCursor(undefined);
                setChangeHistory([]);
              }}
            />
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
            <Pagination
              page={changeHistory.length + 1}
              pageCount={changeHistory.length + 1 + (changes.data.nextCursor ? 1 : 0)}
              onPageChange={(page) => {
                if (page < changeHistory.length + 1) {
                  const previous = changeHistory.at(-1) || undefined;
                  setChangeHistory((items) => items.slice(0, -1));
                  setChangeCursor(previous);
                } else if (changes.data.nextCursor) {
                  setChangeHistory((items) => [...items, changeCursor ?? '']);
                  setChangeCursor(changes.data.nextCursor);
                }
              }}
            />
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
                      page={pagination.page}
                      pageCount={pagination.page + (list.data?.nextCursor ? 1 : 0)}
                      onPageChange={(page) =>
                        page < pagination.page
                          ? pagination.previous()
                          : list.data?.nextCursor
                            ? pagination.next(list.data.nextCursor)
                            : undefined
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
              <dl>
                <dt>Snapshot ID</dt>
                <dd>{snapshot.data?.id ?? '-'}</dd>
                <dt>Status</dt>
                <dd>{snapshot.data?.status ?? '-'}</dd>
                <dt>Unit</dt>
                <dd>{snapshot.data?.unitCount ?? 0}</dd>
                <dt>Member</dt>
                <dd>{snapshot.data?.memberCount ?? 0}</dd>
                <dt>Efektif</dt>
                <dd>
                  {snapshot.data?.effectiveAt
                    ? new Date(snapshot.data.effectiveAt).toLocaleString('id-ID')
                    : '-'}
                </dd>
              </dl>
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
              disabled={Boolean(detail.data?.errors?.length) || !confirmKey}
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
