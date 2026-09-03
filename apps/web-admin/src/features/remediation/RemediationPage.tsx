import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Drawer,
  Input,
  Loader,
  Pagination,
  Select,
  Stack,
} from '@care/ui';
import { AlertTriangle, Building2, CheckCircle2, Clock3, Info, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminKpi } from '../../components/AdminKpi';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { createAdminApi, type RemediationList } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';
import { CategoryConfiguration } from './CategoryConfiguration';
type Issue = RemediationList['items'][number];

const ISSUE_META: Record<
  string,
  { label: string; description: string; group: 'DEPARTMENT' | 'GLOBAL' | 'UNION' | 'SOURCE' }
> = {
  MISSING_DEPARTMENT_HEAD: {
    label: 'Department Head belum tersedia',
    description: 'General Voice belum dapat dirutekan sampai default PIC ditetapkan.',
    group: 'DEPARTMENT',
  },
  INVALID_DEFAULT_PIC: {
    label: 'Default PIC tidak valid',
    description: 'PIC sebelumnya tidak lagi aktif atau tidak eligible pada snapshot terbaru.',
    group: 'DEPARTMENT',
  },
  ROUTE_UNAVAILABLE: {
    label: 'Route gap',
    description: 'Departemen belum terpetakan di route.',
    group: 'DEPARTMENT',
  },
  INVALID_GLOBAL_PIC: {
    label: 'PIC global belum valid',
    description: 'Safety, Environment, dan Facility membutuhkan satu Department Head aktif.',
    group: 'GLOBAL',
  },
  UNION_HEAD_MISSING: {
    label: 'Union Head belum tersedia',
    description: 'Private Voice membutuhkan satu Union Head aktif sebagai route owner.',
    group: 'UNION',
  },
  UNION_OFFICER_MISSING: {
    label: 'Isu dependency union',
    description: 'PIC union belum divalidasi.',
    group: 'UNION',
  },
  DEPARTMENT_14: {
    label: 'Department 14 terdeteksi',
    description: 'Department 14 tidak memiliki General route; member tetap dapat membuat Private.',
    group: 'SOURCE',
  },
  CATEGORY_TARGET_UNAVAILABLE: {
    label: 'Konfigurasi perlu validasi',
    description: 'Perubahan kategori belum divalidasi.',
    group: 'DEPARTMENT',
  },
  CATEGORY_PIC_UNAVAILABLE: {
    label: 'Data master tidak sinkron',
    description: 'Perbedaan data kategori dengan master.',
    group: 'DEPARTMENT',
  },
};

function issueMeta(issue: Issue) {
  return (
    ISSUE_META[issue.type] ?? {
      label: issue.type.replaceAll('_', ' '),
      description: 'Periksa detail issue dan organization snapshot terkait.',
      group: 'SOURCE' as const,
    }
  );
}

function issueCategoryName(issue: Issue): string {
  const category = issue.category as { name?: string; key?: string } | null;
  return category?.name ?? category?.key ?? '—';
}

function issueDepartment(issue: Issue): string {
  if (issue.organizationUnit?.department) {
    const unit = issue.organizationUnit;
    return `${unit.directorate} / ${unit.division} / ${unit.department}`;
  }
  if (issueMeta(issue).group === 'UNION') return 'QA Dept';
  return '—';
}

function formatDetectedAt(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function drawerDescription(issue: Issue | null) {
  if (!issue) return 'Pilih issue untuk melihat scope dan tindakan yang tersedia.';
  if (issue.status !== 'OPEN') return 'Lihat scope, dampak, dan status penyelesaian issue.';
  const group = issueMeta(issue).group;
  if (group === 'GLOBAL') return 'Masukkan No. Reg Department Head aktif untuk PIC global.';
  if (group === 'UNION') return 'Lengkapi fixed Union slot pada halaman Union Accounts.';
  if (group === 'SOURCE') return 'Tinjau dan perbaiki source organization master terkait.';
  return `Masukkan No. Reg PIC untuk department ${issue.organizationUnit?.department ?? 'terdampak'}.`;
}

export function RemediationPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'OPEN';
  const type = searchParams.get('type') ?? '';
  const pagination = cursorPagination(searchParams, setSearchParams);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [noReg, setNoReg] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [operationKey, setOperationKey] = useState('');

  const issues = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'remediation',
      status,
      type,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.remediation({ limit: 20, status, type: type || undefined, cursor: pagination.cursor }),
    enabled: !!session,
  });
  const categories = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'general-voice-categories-admin'),
    queryFn: () => api.generalVoiceCategories('ALL'),
    enabled: !!session,
  });
  const overview = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'overview'),
    queryFn: api.overview,
    enabled: !!session,
    staleTime: 30_000,
  });

  const rows = issues.data?.items ?? [];
  const openTotal =
    overview.data?.openRemediation ?? rows.filter((i) => i.status === 'OPEN').length;
  const categoryList = categories.data ?? [];
  const routeGaps = categoryList.filter((c) => {
    const route = c.route as { health?: string } | undefined;
    return route?.health !== 'HEALTHY';
  }).length;
  const compliance =
    categoryList.length > 0
      ? Math.round(((categoryList.length - routeGaps) / categoryList.length) * 100)
      : 100;

  const assignDefault = useMutation({
    mutationFn: async () => {
      if (!selected?.organizationUnitId) throw new Error('Pilih unit');
      return api.setDefaultPic(selected.organizationUnitId, { noReg: noReg.trim() }, operationKey);
    },
    onSuccess: () => {
      setDrawerOpen(false);
      setNoReg('');
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'remediation'),
      });
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'overview'),
      });
    },
  });

  const lastUpdated = Math.max(issues.dataUpdatedAt, categories.dataUpdatedAt);

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Organization Routing"
        title="Remediation & Route"
        description="Pantau route gap, pengiriman remediation, dan pastikan PIC setiap kategori."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void Promise.all([issues.refetch(), categories.refetch(), overview.refetch()])
            }
          >
            Segarkan
          </Button>
        }
      />

      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1rem' }}
      >
        <section className="admin-card" aria-label="Mode route">
          <dl className="admin-dl">
            <div>
              <dt>Route mode</dt>
              <dd style={{ color: 'var(--raw-brand-700)' }}>Operational</dd>
            </div>
            <div>
              <dt>PIC Global</dt>
              <dd>Fixed User Head</dd>
            </div>
            <div>
              <dt>Terakhir diperbarui</dt>
              <dd style={{ color: 'var(--raw-brand-700)' }}>
                {lastUpdated ? new Date(lastUpdated).toLocaleString('id-ID') : '—'}
              </dd>
            </div>
          </dl>
        </section>
        <section className="admin-card" aria-label="Statistik route">
          <div
            className="admin-kpi-strip admin-kpi-strip--2col"
            style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', rowGap: '1rem' }}
          >
            <AdminKpi
              icon={<Building2 size={18} />}
              iconTone="brand"
              value={categoryList.length}
              label="Kategori dikonfigurasi"
              sub="Total kategori"
            />
            <AdminKpi
              icon={<TriangleAlert size={18} />}
              iconTone="danger"
              value={routeGaps}
              valueTone={routeGaps > 0 ? 'danger' : undefined}
              label="Route gap"
              sub="Perlu PIC"
            />
            <AdminKpi
              icon={<AlertTriangle size={18} />}
              iconTone="warning"
              value={openTotal}
              valueTone={openTotal > 0 ? 'warning' : undefined}
              label="Isu terbuka"
              sub="Perlu remediation"
            />
            <AdminKpi
              icon={<CheckCircle2 size={18} />}
              iconTone="success"
              value={routeGaps === 0 ? 'Sehat' : 'Perlu tindakan'}
              valueTone={routeGaps === 0 ? 'success' : 'warning'}
              label="Status route"
              sub={`${compliance}% compliance`}
            />
          </div>
        </section>
      </div>

      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(26rem, 1fr))', gap: '1rem' }}
      >
        <div>
          <CategoryConfiguration />
        </div>

        <section className="admin-table-card" aria-label="Antrian remediation">
          <div style={{ padding: '1rem 1.25rem 0' }}>
            <div className="admin-section__head">
              <div>
                <h2 className="admin-card__title" style={{ margin: 0 }}>
                  Antrian remediation
                </h2>
                <p className="admin-card__subtitle" style={{ margin: 0 }}>
                  Tangani rute terbuka dan pastikan penyelesaian sebelum submission.
                </p>
              </div>
            </div>
            <div className="admin-filterbar" style={{ boxShadow: 'none', marginTop: '0.75rem' }}>
              <div
                className="admin-filterbar__controls"
                style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
              >
                <Select
                  label="Status"
                  value={status}
                  onValueChange={(v) => setSearchParams({ status: v, ...(type ? { type } : {}) })}
                  options={[
                    { value: 'OPEN', label: 'Terbuka' },
                    { value: 'RESOLVED', label: 'Selesai' },
                    { value: 'SUPERSEDED', label: 'Digantikan' },
                  ]}
                />
                <Select
                  label="Tipe isu"
                  value={type || 'ALL'}
                  onValueChange={(v) =>
                    setSearchParams({ status, ...(v !== 'ALL' ? { type: v } : {}) })
                  }
                  options={[
                    { value: 'ALL', label: 'Semua tipe' },
                    { value: 'MISSING_DEPARTMENT_HEAD', label: 'Department Head belum ada' },
                    { value: 'INVALID_DEFAULT_PIC', label: 'Default PIC tidak valid' },
                    { value: 'ROUTE_UNAVAILABLE', label: 'Route tidak tersedia' },
                    { value: 'CATEGORY_TARGET_UNAVAILABLE', label: 'Target kategori belum ada' },
                    { value: 'CATEGORY_PIC_UNAVAILABLE', label: 'PIC kategori belum ada' },
                    { value: 'UNION_HEAD_MISSING', label: 'Union Head belum ada' },
                    { value: 'UNION_OFFICER_MISSING', label: 'Union Officer belum lengkap' },
                    { value: 'DEPARTMENT_14', label: 'Department 14' },
                  ]}
                />
              </div>
            </div>
            {openTotal > 0 ? (
              <Alert tone="danger" title="Submission diblokir">
                Selesaikan semua rute terbuka yang memerlukan tindakan sebelum submission baru.
              </Alert>
            ) : null}
          </div>
          {issues.isLoading ? (
            <div style={{ padding: '1.25rem' }}>
              <Loader label="Memuat remediation" />
            </div>
          ) : issues.error ? (
            <div style={{ padding: '1.25rem' }}>
              <Alert tone="danger" title="Gagal">
                {String((issues.error as Error).message)}
              </Alert>
            </div>
          ) : (
            <>
              <DataTable
                caption="Daftar remediation route dan department terdampak"
                columns={[
                  {
                    key: 'issue',
                    header: 'Isu',
                    cell: (r: Issue) => {
                      const meta = issueMeta(r);
                      return (
                        <span className="admin-rowbody">
                          <strong>{meta.label}</strong>
                          <span>{meta.description}</span>
                        </span>
                      );
                    },
                  },
                  {
                    key: 'category',
                    header: 'Kategori',
                    cell: (r: Issue) => issueCategoryName(r),
                  },
                  {
                    key: 'department',
                    header: 'Departemen terdampak',
                    cell: (r: Issue) => (
                      <span className="admin-rowbody">
                        <strong>{r.organizationUnit?.department ?? '—'}</strong>
                        {r.organizationUnit ? (
                          <span>
                            {r.organizationUnit.directorate} · {r.organizationUnit.division}
                          </span>
                        ) : (
                          <span>Non-workforce configuration</span>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (r: Issue) => (
                      <span
                        className="admin-pill"
                        data-tone={r.status === 'RESOLVED' ? 'success' : 'warning'}
                      >
                        {r.status}
                      </span>
                    ),
                  },
                  {
                    key: 'pic',
                    header: 'PIC',
                    cell: () => '–',
                  },
                  {
                    key: 'updated',
                    header: 'Terakhir diperbarui',
                    cell: (r: Issue) => (
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <Clock3 size={12} aria-hidden="true" /> {formatDetectedAt(r.createdAt)}
                      </span>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'Aksi',
                    cell: (r: Issue) => (
                      <Button
                        size="sm"
                        variant={r.status === 'OPEN' ? 'primary' : 'secondary'}
                        onClick={() => {
                          setSelected(r);
                          setNoReg('');
                          setOperationKey(crypto.randomUUID());
                          setDrawerOpen(true);
                        }}
                      >
                        {r.status === 'OPEN' ? 'Tangani issue' : 'Lihat detail'}
                      </Button>
                    ),
                  },
                ]}
                rows={rows as never}
                rowKey={(r: Issue) => r.id}
                empty={
                  <span>
                    <CheckCircle2 size={18} aria-hidden="true" /> Tidak ada isu — tidak ada
                    remediation yang cocok dengan filter saat ini.
                  </span>
                }
              />
              <div className="admin-table-foot">
                <span>
                  Menampilkan 1–{rows.length} dari{' '}
                  {rows.length + (issues.data?.nextCursor ? '+' : '')}
                </span>
                <Pagination
                  page={pagination.page}
                  pageCount={pagination.page + (issues.data?.nextCursor ? 1 : 0)}
                  onPageChange={(page) =>
                    page < pagination.page
                      ? pagination.previous()
                      : issues.data?.nextCursor
                        ? pagination.next(issues.data.nextCursor)
                        : undefined
                  }
                />
              </div>
            </>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setNoReg('');
        }}
        title={selected ? issueMeta(selected).label : 'Detail remediation'}
        description={drawerDescription(selected)}
      >
        <Stack gap="md">
          {selected ? (
            <div className="remediation-drawer-scope">
              <span className="remediation-drawer-scope__icon" aria-hidden="true">
                <Building2 size={20} />
              </span>
              <div>
                <span>Scope terdampak</span>
                <strong>{issueDepartment(selected)}</strong>
                <small>Kategori: {issueCategoryName(selected)}</small>
              </div>
              <Badge tone={selected.status === 'RESOLVED' ? 'success' : 'warning'}>
                {selected.status}
              </Badge>
            </div>
          ) : null}
          {selected ? (
            <Alert tone="info" title="Dampak operasional">
              {issueMeta(selected).description}
            </Alert>
          ) : null}
          {selected && selected.status !== 'OPEN' ? (
            <Alert tone="success" title="Issue tidak memerlukan tindakan">
              Issue ini berstatus {selected.status}. Informasi ditampilkan untuk penelusuran.
            </Alert>
          ) : null}
          {selected?.status === 'OPEN' &&
          (selected.type === 'MISSING_DEPARTMENT_HEAD' ||
            selected.type === 'INVALID_DEFAULT_PIC' ||
            selected.type === 'ROUTE_UNAVAILABLE') ? (
            <>
              <div className="remediation-form-intro">
                <strong>Tetapkan PIC department</strong>
                <span>
                  Masukkan No. Reg karyawan aktif. Account dan eligibility diverifikasi oleh server.
                </span>
              </div>
              <Input
                label="No. Reg"
                value={noReg}
                onChange={(e) => setNoReg(e.target.value)}
                placeholder="Contoh: 000128"
              />
              <Button
                onClick={() => assignDefault.mutate()}
                loading={assignDefault.isPending}
                disabled={!noReg.trim()}
              >
                Simpan default PIC
              </Button>
              {assignDefault.error ? (
                <Alert tone="danger" title="Gagal">
                  {String((assignDefault.error as Error).message)}
                </Alert>
              ) : null}
            </>
          ) : null}
          {selected?.status === 'OPEN' &&
          (selected.type === 'UNION_HEAD_MISSING' || selected.type === 'UNION_OFFICER_MISSING') ? (
            <Alert tone="info" title="Kelola melalui fixed Union slots">
              Isu ini harus diselesaikan pada halaman Union Accounts agar HEAD/OFFICER dan
              optimistic term expectation tetap benar.
              <div>
                <Button size="sm" onClick={() => navigate('/union')}>
                  Buka Union Accounts
                </Button>
              </div>
            </Alert>
          ) : null}
          {selected?.status === 'OPEN' && selected.type === 'DEPARTMENT_14' ? (
            <Alert tone="warning" title="Perbaiki melalui master organisasi">
              Department 14 berasal dari source snapshot dan tidak dapat diberi General route.
              <div>
                <Button size="sm" onClick={() => navigate('/imports')}>
                  Buka Import & Master Data
                </Button>
              </div>
            </Alert>
          ) : null}
          {!selected ? <p>Pilih isu untuk menangani.</p> : null}
          <p className="admin-meta--xs">
            <Info size={12} aria-hidden="true" /> Department Head belum tersedia — General Voice
            belum dapat dirutekan sampai default PIC ditetapkan.
          </p>
        </Stack>
      </Drawer>
    </Stack>
  );
}
