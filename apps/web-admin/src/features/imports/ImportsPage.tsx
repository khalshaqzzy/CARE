import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Dialog,
  FileUpload,
  Loader,
  Pagination,
  Stack,
  Tabs,
} from '@care/ui';
import {
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Download,
  FileSpreadsheet,
  Info,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { AdminStepper } from '../../components/AdminStepper';
import { createAdminApi, type ImportPreview } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

const STEPS = [
  { title: 'Upload', hint: 'Unggah file .xlsx/.csv' },
  { title: 'Validasi', hint: 'Periksa data' },
  { title: 'Preview', hint: 'Preview perubahan' },
  { title: 'Konfirmasi', hint: 'Konfirmasi impor' },
];

type ChangeRow = {
  noReg: string;
  type: string;
  positionChanged?: boolean;
  organizationChanged?: boolean;
  nameChanged?: boolean;
};

function changeDetail(row: ChangeRow) {
  const parts: string[] = [];
  if (row.positionChanged) parts.push('posisi');
  if (row.organizationChanged) parts.push('organisasi');
  if (row.nameChanged) parts.push('nama');
  return parts.length ? parts.join(' • ') : '—';
}

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
  const refreshedTerminal = useRef<string | null>(null);

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

  useEffect(() => {
    const terminalDetail = detail.data;
    if (!terminalDetail) return;
    const status = terminalDetail.status;
    if (status !== 'CONFIRMED' && status !== 'FAILED') return;
    const terminalKey = `${terminalDetail.id}:${terminalDetail.version}:${status}`;
    if (refreshedTerminal.current === terminalKey) return;
    refreshedTerminal.current = terminalKey;
    const sessionId = session?.sessionId ?? 'anon';
    const invalidations = [
      qc.invalidateQueries({ queryKey: careQueryKey(sessionId, 'imports', 'list') }),
    ];
    if (status === 'CONFIRMED')
      invalidations.push(
        qc.invalidateQueries({ queryKey: careQueryKey(sessionId, 'imports', 'snapshot') }),
        qc.invalidateQueries({ queryKey: careQueryKey(sessionId, 'overview') }),
        qc.invalidateQueries({ queryKey: careQueryKey(sessionId, 'accounts') }),
        qc.invalidateQueries({ queryKey: careQueryKey(sessionId, 'remediation') }),
      );
    void Promise.all(invalidations);
  }, [detail.data?.id, detail.data?.status, detail.data?.version, qc, session?.sessionId]);

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

  const data = detail.data;
  const step = !data ? 0 : data.errors?.length ? 1 : data.status === 'PREVIEWED' ? 2 : 3;
  const changeItems = (changes.data?.items ?? []) as ChangeRow[];
  const counts = {
    create: data?.summary.create ?? 0,
    update: data?.summary.update ?? 0,
    deactivate: data?.summary.deactivate ?? 0,
    unchanged: Math.max(
      0,
      (data?.summary.rowCount ?? 0) -
        (data?.summary.create ?? 0) -
        (data?.summary.update ?? 0) -
        (data?.summary.deactivate ?? 0),
    ),
  };

  const downloadSummary = () => {
    const lines = [
      'noReg,tipe,detail',
      ...changeItems.map((row) => `${row.noReg},${row.type},"${changeDetail(row)}"`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ringkasan-impor-${data?.id.slice(0, 8) ?? 'batch'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Master Data"
        title="Import & Master Data"
        description="Unggah, validasi, pratinjau perubahan, dan konfirmasi impor data master."
        updatedLabel={
          snapshot.data?.effectiveAt
            ? new Date(snapshot.data.effectiveAt).toLocaleString('id-ID')
            : undefined
        }
        onRefresh={() => {
          void list.refetch();
          void snapshot.refetch();
          if (previewId) void detail.refetch();
        }}
        refreshing={list.isFetching || detail.isFetching}
      />

      <AdminStepper steps={STEPS} step={step} />

      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(24rem, 1fr))', gap: '1rem' }}
      >
        <section className="admin-card admin-card--lift" aria-label="Upload file">
          <h2 className="admin-card__title">
            <CloudUpload size={18} aria-hidden="true" /> Upload CSV
          </h2>
          <p className="admin-card__subtitle">
            Unggah file .xlsx (sheet “MFG + QD”) atau .csv UTF-8, maksimal 10 MB. Header wajib:
            Noreg, Nama, Posisi (struktural), Directorat, Division, Department, Section.
          </p>
          <FileUpload
            label="Unggah file organisasi"
            accept=".xlsx,.csv"
            maxFiles={1}
            onFilesAdded={(files) => setFile(files[0] ?? null)}
          />
          {file ? (
            <p className="admin-meta" style={{ marginTop: '0.5rem' }}>
              <FileSpreadsheet size={14} aria-hidden="true" /> Terpilih: {file.name} (
              {(file.size / 1024).toFixed(1)} KB){' '}
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                Ganti file
              </Button>
            </p>
          ) : null}
          {previewMutation.error ? (
            <Alert tone="danger" title="Gagal preview">
              {String((previewMutation.error as Error).message)}
            </Alert>
          ) : null}
        </section>

        <section className="admin-card admin-card--hero" aria-label="Ringkasan batch">
          <div className="admin-section__head">
            <h2 className="admin-card__title" style={{ margin: 0 }}>
              Ringkasan batch
            </h2>
            {data ? (
              <Badge
                tone={
                  data.status === 'CONFIRMED'
                    ? 'success'
                    : data.status === 'FAILED'
                      ? 'danger'
                      : 'info'
                }
              >
                {data.status === 'PREVIEWED' ? 'SIAP DIVALIDASI' : data.status}
              </Badge>
            ) : (
              <span className="admin-pill" data-tone="neutral">
                Belum ada batch
              </span>
            )}
          </div>
          {data ? (
            <Stack gap="sm">
              <dl className="admin-dl">
                <div>
                  <dt>Nama batch</dt>
                  <dd className="admin-id">{data.id.slice(0, 8)}</dd>
                </div>
                <div>
                  <dt>Diupload pada</dt>
                  <dd>{new Date(data.createdAt).toLocaleString('id-ID')}</dd>
                </div>
                <div>
                  <dt>Total baris</dt>
                  <dd>{data.summary.rowCount.toLocaleString('id-ID')}</dd>
                </div>
                <div>
                  <dt>Checksum</dt>
                  <dd className="admin-id">{data.checksum.slice(0, 12)}…</dd>
                </div>
              </dl>
              <ul className="admin-rows">
                <li>
                  <span className="admin-rowmark" data-tone="success">
                    <CheckCircle2 size={16} aria-hidden="true" />
                  </span>
                  <span className="admin-rowbody">
                    <strong>Akan dibuat</strong>
                  </span>
                  <span className="admin-rowside">
                    <strong>{counts.create.toLocaleString('id-ID')}</strong>
                  </span>
                </li>
                <li>
                  <span className="admin-rowmark" data-tone="warning">
                    <TriangleAlert size={16} aria-hidden="true" />
                  </span>
                  <span className="admin-rowbody">
                    <strong>Akan diperbarui</strong>
                  </span>
                  <span className="admin-rowside">
                    <strong>{counts.update.toLocaleString('id-ID')}</strong>
                  </span>
                </li>
                <li>
                  <span className="admin-rowmark" data-tone="danger">
                    <CircleAlert size={16} aria-hidden="true" />
                  </span>
                  <span className="admin-rowbody">
                    <strong>Akan dinonaktifkan</strong>
                  </span>
                  <span className="admin-rowside">
                    <strong>{counts.deactivate.toLocaleString('id-ID')}</strong>
                  </span>
                </li>
                <li>
                  <span className="admin-rowmark" data-tone="info">
                    <Info size={16} aria-hidden="true" />
                  </span>
                  <span className="admin-rowbody">
                    <strong>Tidak ada perubahan</strong>
                  </span>
                  <span className="admin-rowside">
                    <strong>{counts.unchanged.toLocaleString('id-ID')}</strong>
                  </span>
                </li>
              </ul>
              <p className="admin-note">
                <Info size={14} aria-hidden="true" />
                <span>
                  Snapshot aktif saat ini diambil{' '}
                  {snapshot.data?.effectiveAt
                    ? new Date(snapshot.data.effectiveAt).toLocaleString('id-ID')
                    : '—'}
                  . Konfirmasi menonaktifkan akun yang hilang dari snapshot baru.
                </span>
              </p>
            </Stack>
          ) : (
            <p className="admin-meta">
              Pilih file lalu tekan “Validasi data” untuk membuat pratinjau batch.
            </p>
          )}
        </section>
      </div>

      {data?.errors?.length ? (
        <Alert
          tone={
            data.errors.some((e) => e.code === 'DUPLICATE_DEPARTMENT_HEAD') ? 'danger' : 'warning'
          }
          title="Blocking validation"
        >
          {data.errors.map((e) => `${String(e.code)}: ${String(e.message ?? '')}`).join(' • ')}
        </Alert>
      ) : null}

      {data ? (
        <section className="admin-table-card" aria-label="Ringkasan perubahan">
          <div className="admin-section__head" style={{ padding: '1rem 1.25rem 0' }}>
            <div>
              <h2 className="admin-card__title" style={{ margin: 0 }}>
                Ringkasan perubahan (pratinjau)
              </h2>
              <p className="admin-card__subtitle" style={{ margin: 0 }}>
                Menampilkan hingga 20 baris pertama dari setiap kategori perubahan.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadSummary}
              disabled={!changeItems.length}
            >
              <Download size={14} /> Unduh ringkasan
            </Button>
          </div>
          <div style={{ padding: '0 1.25rem' }}>
            <Tabs
              label="Filter perubahan"
              defaultValue={changeFilter || 'ALL'}
              items={[
                { value: 'ALL', label: 'Semua', content: null },
                { value: 'CREATE', label: `Akan dibuat (${counts.create})`, content: null },
                { value: 'UPDATE', label: `Akan diperbarui (${counts.update})`, content: null },
                {
                  value: 'DEACTIVATE',
                  label: `Akan dinonaktifkan (${counts.deactivate})`,
                  content: null,
                },
              ]}
              onValueChange={(value) => {
                setChangeFilter(value === 'ALL' ? '' : value);
                setChangeCursor(undefined);
                setChangeHistory([]);
              }}
            />
          </div>
          {changes.isLoading ? (
            <div style={{ padding: '1.25rem' }}>
              <AdminSkeleton lines={4} label="Memuat perubahan" />
            </div>
          ) : (
            <>
              <DataTable
                caption="Pratinjau perubahan impor"
                columns={[
                  {
                    key: 'noReg',
                    header: 'No. Reg',
                    cell: (r: ChangeRow) => <span className="admin-id">{r.noReg}</span>,
                  },
                  {
                    key: 'type',
                    header: 'Kategori',
                    cell: (r: ChangeRow) => (
                      <Badge
                        tone={
                          r.type === 'CREATE'
                            ? 'success'
                            : r.type === 'DEACTIVATE'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {r.type}
                      </Badge>
                    ),
                  },
                  { key: 'detail', header: 'Perubahan', cell: (r: ChangeRow) => changeDetail(r) },
                ]}
                rows={changeItems as never}
                rowKey={(r: ChangeRow) => `${r.noReg}-${r.type}`}
                empty={
                  <AdminEmpty
                    title="Tidak ada perubahan"
                    description="Pratinjau batch ini belum memiliki baris pada filter aktif."
                  />
                }
              />
              <div className="admin-table-foot">
                <span>
                  Total {changes.data?.total ?? 0} perubahan
                  {changeFilter ? ` · filter ${changeFilter}` : ''}
                </span>
                <Pagination
                  page={changeHistory.length + 1}
                  pageCount={changeHistory.length + 1 + (changes.data?.nextCursor ? 1 : 0)}
                  onPageChange={(page) => {
                    if (page < changeHistory.length + 1) {
                      const previous = changeHistory.at(-1) || undefined;
                      setChangeHistory((items) => items.slice(0, -1));
                      setChangeCursor(previous);
                    } else if (changes.data?.nextCursor) {
                      setChangeHistory((items) => [...items, changeCursor ?? '']);
                      setChangeCursor(changes.data.nextCursor);
                    }
                  }}
                />
              </div>
            </>
          )}
        </section>
      ) : null}

      <div className="admin-stickybar">
        <span className="admin-stickybar__hint">
          {data
            ? `Batch ${data.id.slice(0, 8)} · ${data.status}`
            : 'Pilih file untuk memulai pratinjau batch.'}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setFile(null);
            const params = new URLSearchParams(searchParams);
            params.delete('previewId');
            setSearchParams(params);
          }}
        >
          Batal
        </Button>
        {!data ? (
          <Button
            onClick={() => file && previewMutation.mutate(file)}
            loading={previewMutation.isPending}
            disabled={!file}
          >
            Validasi data →
          </Button>
        ) : data.status === 'PREVIEWED' ? (
          <Button
            onClick={() => {
              setConfirmKey(crypto.randomUUID());
              setConfirmOpen(true);
            }}
            disabled={Boolean(data.errors?.length)}
          >
            Konfirmasi import
          </Button>
        ) : data.status === 'QUEUED' || data.status === 'PROCESSING' ? (
          <Loader label="Memproses import" />
        ) : data.status === 'CONFIRMED' ? (
          <Alert tone="success" title="Berhasil">
            Import telah dikonfirmasi.
          </Alert>
        ) : (
          <Alert tone="danger" title="Gagal">
            Import gagal diproses.
          </Alert>
        )}
      </div>

      <section className="admin-table-card" aria-label="Riwayat impor">
        <div className="admin-section__head" style={{ padding: '1rem 1.25rem 0' }}>
          <h2 className="admin-card__title" style={{ margin: 0 }}>
            Riwayat impor
          </h2>
        </div>
        {list.isLoading ? (
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={4} label="Memuat history" />
          </div>
        ) : list.error ? (
          <div style={{ padding: '1.25rem' }}>
            <Alert tone="danger" title="Gagal">
              {String((list.error as Error).message)}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              caption="Riwayat batch impor"
              columns={[
                {
                  key: 'id',
                  header: 'Batch',
                  cell: (r: ImportPreview) => <span className="admin-id">{r.id.slice(0, 8)}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r: ImportPreview) => (
                    <span style={{ display: 'grid', gap: '0.25rem' }}>
                      <Badge
                        tone={
                          r.status === 'CONFIRMED'
                            ? 'success'
                            : r.status === 'FAILED'
                              ? 'danger'
                              : 'info'
                        }
                      >
                        {r.status}
                      </Badge>
                      {(r as ImportPreview & { failureCode?: string | null }).failureCode ? (
                        <small>
                          {(r as ImportPreview & { failureCode?: string | null }).failureCode}
                        </small>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: 'rowCount',
                  header: 'Baris',
                  cell: (r: ImportPreview) => String((r.summary as { rowCount: number }).rowCount),
                },
                {
                  key: 'createdAt',
                  header: 'Dibuat',
                  cell: (r: ImportPreview) => new Date(r.createdAt).toLocaleString('id-ID'),
                },
              ]}
              rows={(list.data?.items ?? []) as never}
              rowKey={(r: ImportPreview) => r.id}
              empty={
                <AdminEmpty
                  title="Belum ada import"
                  description="Unggah file organisasi pertama untuk mengisi riwayat batch."
                />
              }
            />
            <div className="admin-table-foot">
              <span>Snapshot aktif: {snapshot.data?.id?.slice(0, 8) ?? '—'}</span>
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
            </div>
          </>
        )}
      </section>

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
              disabled={Boolean(data?.errors?.length) || !confirmKey}
            >
              Ya, konfirmasi
            </Button>
          </>
        }
      >
        <Alert tone="warning" title="Perhatikan deactivation">
          {data
            ? `${data.summary.deactivate} akun akan dinonaktifkan. Pastikan sudah benar.`
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
