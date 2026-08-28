import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  Input,
  Loader,
  PageHeader,
  Select,
  Stack,
  Pagination,
  StatCard,
} from '@care/ui';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Globe2,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createAdminApi, type RemediationList } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';
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
    label: 'Route department tidak tersedia',
    description: 'Department tidak memiliki route owner aktif untuk menerima General Voice.',
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
    label: 'Union Officer belum lengkap',
    description: 'Lengkapi fixed slot Union 1 dan Union 2 pada konfigurasi Union.',
    group: 'UNION',
  },
  DEPARTMENT_14: {
    label: 'Department 14 terdeteksi',
    description: 'Department 14 tidak memiliki General route; member tetap dapat membuat Private.',
    group: 'SOURCE',
  },
};

const statusTone = (value: string) =>
  value === 'RESOLVED' ? 'success' : value === 'SUPERSEDED' ? 'neutral' : 'warning';

function issueMeta(issue: Issue) {
  return (
    ISSUE_META[issue.type] ?? {
      label: issue.type.replaceAll('_', ' '),
      description: 'Periksa detail issue dan organization snapshot terkait.',
      group: 'SOURCE' as const,
    }
  );
}

function affectedScope(issue: Issue) {
  if (issue.type === 'INVALID_GLOBAL_PIC') return 'Seluruh department';
  if (issue.type.startsWith('UNION_')) return 'Konfigurasi Union';
  return issue.organizationUnit?.department ?? 'Organization master';
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
  const overview = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'overview'),
    queryFn: api.overview,
    enabled: !!session,
    staleTime: 30_000,
  });

  const rows = issues.data?.items ?? [];
  const openOnPage = rows.filter((issue) => issue.status === 'OPEN').length;
  const affectedDepartments = new Set(
    rows.flatMap((issue) =>
      issue.organizationUnit?.department ? [issue.organizationUnit.department] : [],
    ),
  ).size;
  const routeIssues = rows.filter((issue) =>
    ['DEPARTMENT', 'GLOBAL'].includes(issueMeta(issue).group),
  ).length;
  const unionIssues = rows.filter((issue) => issueMeta(issue).group === 'UNION').length;

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

  const assignGlobal = useMutation({
    mutationFn: () => api.setGlobalPic({ noReg: noReg.trim() }, operationKey),
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

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Organization routing"
        title="Remediation & Route"
        description="Pantau route gap, lihat department yang terdampak, dan pulihkan PIC berdasarkan No. Reg."
        actions={
          <Button
            variant="secondary"
            onClick={() => void Promise.all([issues.refetch(), overview.refetch()])}
          >
            <RefreshCw size={16} /> Segarkan
          </Button>
        }
      />

      <div className="care-grid remediation-stats">
        <StatCard
          label="Isu terbuka"
          value={String(overview.data?.openRemediation ?? openOnPage)}
          description="Memerlukan tindakan Admin"
          icon={<AlertTriangle size={18} />}
          tone={(overview.data?.openRemediation ?? openOnPage) > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Department terdampak"
          value={String(affectedDepartments)}
          description="Pada halaman aktif"
          icon={<Building2 size={18} />}
          tone={affectedDepartments ? 'brand' : 'default'}
        />
        <StatCard
          label="Route issue"
          value={String(routeIssues)}
          description="Department dan PIC global"
          icon={<RouteIcon size={18} />}
        />
        <StatCard
          label="Dependency Union"
          value={String(unionIssues)}
          description="Fixed slot Head dan Officer"
          icon={<ShieldCheck size={18} />}
        />
      </div>

      {(overview.data?.openRemediation ?? 0) > 0 ? (
        <Alert tone="warning" title="Route gap dapat memblokir submission baru">
          Selesaikan issue department dan PIC global lebih dahulu. Voice historis dan assignment
          yang sudah ada tidak berubah.
        </Alert>
      ) : null}

      <Card className="remediation-workspace">
        <Stack gap="sm">
          <div className="remediation-workspace__head">
            <div>
              <span className="remediation-workspace__icon" aria-hidden="true">
                <RouteIcon size={18} />
              </span>
              <div>
                <h2>Antrian remediation</h2>
                <p>{rows.length} issue pada halaman ini · maksimal 20 issue per halaman</p>
              </div>
            </div>
            <Badge tone={statusTone(status)}>{status}</Badge>
          </div>
          <div className="admin-toolbar remediation-filters">
            <div className="remediation-filters__copy">
              <strong>Filter issue</strong>
              <span>Fokuskan antrian berdasarkan status dan dependency.</span>
            </div>
            <div className="remediation-filters__controls">
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
                label="Tipe issue"
                value={type || 'ALL'}
                onValueChange={(v) =>
                  setSearchParams({ status, ...(v !== 'ALL' ? { type: v } : {}) })
                }
                options={[
                  { value: 'ALL', label: 'Semua tipe' },
                  { value: 'MISSING_DEPARTMENT_HEAD', label: 'Department Head belum ada' },
                  { value: 'INVALID_DEFAULT_PIC', label: 'Default PIC tidak valid' },
                  { value: 'ROUTE_UNAVAILABLE', label: 'Route tidak tersedia' },
                  { value: 'INVALID_GLOBAL_PIC', label: 'PIC global tidak valid' },
                  { value: 'UNION_HEAD_MISSING', label: 'Union Head belum ada' },
                  { value: 'UNION_OFFICER_MISSING', label: 'Union Officer belum lengkap' },
                  { value: 'DEPARTMENT_14', label: 'Department 14' },
                ]}
              />
              {type || status !== 'OPEN' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchParams({ status: 'OPEN' })}
                >
                  Reset filter
                </Button>
              ) : null}
            </div>
          </div>
          {issues.isLoading ? (
            <Loader label="Memuat remediation" />
          ) : issues.error ? (
            <Alert tone="danger" title="Gagal">
              {String((issues.error as Error).message)}
            </Alert>
          ) : (
            <DataTable
              caption="Daftar remediation route dan department terdampak"
              columns={[
                {
                  key: 'type',
                  header: 'Issue',
                  width: '31%',
                  cell: (r: Issue) => {
                    const meta = issueMeta(r);
                    return (
                      <div className="remediation-issue">
                        <span className="remediation-issue__mark" data-group={meta.group}>
                          {meta.group === 'GLOBAL' ? (
                            <Globe2 size={17} />
                          ) : meta.group === 'UNION' ? (
                            <ShieldCheck size={17} />
                          ) : (
                            <Building2 size={17} />
                          )}
                        </span>
                        <div>
                          <strong>{meta.label}</strong>
                          <span>{meta.description}</span>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: 'unit',
                  header: 'Department terdampak',
                  width: '27%',
                  cell: (r: Issue) => (
                    <div className="remediation-scope">
                      <strong>{affectedScope(r)}</strong>
                      {r.organizationUnit ? (
                        <span>
                          {r.organizationUnit.directorate} · {r.organizationUnit.division}
                        </span>
                      ) : (
                        <span>
                          {issueMeta(r).group === 'GLOBAL'
                            ? 'Semua area'
                            : 'Non-workforce configuration'}
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r: Issue) => (
                    <div className="remediation-status">
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      <span>
                        <Clock3 size={13} /> {formatDetectedAt(r.createdAt)}
                      </span>
                    </div>
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
              rows={(issues.data?.items ?? []) as never}
              rowKey={(r: Issue) => r.id}
              empty={
                <div className="remediation-empty">
                  <CheckCircle2 size={22} />
                  <strong>Tidak ada isu</strong>
                  <span>Tidak ada remediation yang cocok dengan filter saat ini.</span>
                </div>
              }
            />
          )}
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
        </Stack>
      </Card>

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
                {issueMeta(selected).group === 'GLOBAL' ? (
                  <Globe2 size={20} />
                ) : (
                  <Building2 size={20} />
                )}
              </span>
              <div>
                <span>Scope terdampak</span>
                <strong>{affectedScope(selected)}</strong>
                {selected.organizationUnit ? (
                  <small>
                    {selected.organizationUnit.directorate} → {selected.organizationUnit.division}
                  </small>
                ) : null}
              </div>
              <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
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
          {selected?.status === 'OPEN' && selected.type === 'INVALID_GLOBAL_PIC' ? (
            <>
              <div className="remediation-form-intro">
                <strong>Tetapkan PIC global</strong>
                <span>No. Reg harus milik Department Head aktif pada snapshot organisasi.</span>
              </div>
              <Input
                label="No. Reg"
                value={noReg}
                onChange={(e) => setNoReg(e.target.value)}
                placeholder="Contoh: 000128"
              />
              <Button
                onClick={() => assignGlobal.mutate()}
                loading={assignGlobal.isPending}
                disabled={!noReg.trim()}
              >
                Simpan global PIC
              </Button>
              {assignGlobal.error ? (
                <Alert tone="danger" title="Gagal">
                  {String((assignGlobal.error as Error).message)}
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
        </Stack>
      </Drawer>
    </Stack>
  );
}
