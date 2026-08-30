import { Alert, Card, EmptyState, Input, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Briefcase,
  Building2,
  HardHat,
  Leaf,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { AttentionCard } from '../../components/AttentionCard';
import { FilterPillRow } from '../../components/FilterPills';
import { HeroBand, HeroChip, HeroInset } from '../../components/HeroBand';
import { InboxVoiceCard } from '../../components/InboxVoiceCard';
import { KpiTrio, generalKpiItems } from '../../components/KpiTrio';
import { Pager } from '../../components/Pager';
import { StatusDistribution } from '../../components/StatusDistribution';
import { TrendCard } from '../../components/TrendCard';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatRelative,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from '../../lib/formatters';
import { dashboardDates, type DashboardRange } from '../../lib/dashboard-range';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import type { DashboardAggregate } from '../../workforce-api';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  SAFETY: <HardHat />,
  FACILITY: <Building2 />,
  ENVIRONMENT: <Leaf />,
  WORK_DIFFICULTY: <Briefcase />,
};

const RANGE_LABELS: Record<DashboardRange, string> = {
  '30d': '30 hari terakhir',
  '90d': '90 hari terakhir',
  year: 'Tahun berjalan',
  all: 'Semua waktu',
  custom: 'Pilih tanggal',
};

export function GeneralBrowsePage() {
  const { session } = useAuth();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useCursorPagination(searchParams, setSearchParams);

  const status = searchParams.get('status') ?? undefined;
  const severity = searchParams.get('severity') ?? undefined;
  const area = searchParams.get('area') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const range = (searchParams.get('range') ?? '30d') as DashboardRange;
  const customFrom = searchParams.get('dashFrom') ?? undefined;
  const customTo = searchParams.get('dashTo') ?? undefined;
  const dates = useMemo(
    () => dashboardDates(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const chart = useQuery({
    queryKey: voiceQuery(
      sessionId,
      'dashboard',
      'general',
      range,
      customFrom,
      customTo,
      status,
      severity,
      area,
      category,
    ),
    queryFn: () =>
      api.dashboardGeneral({
        ...dates,
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(category ? { category: category as never } : {}),
      }),
    enabled: !!session,
    refetchInterval: 3000,
  });

  const list = useQuery({
    queryKey: voiceQuery(
      sessionId,
      'general',
      range,
      customFrom,
      customTo,
      status,
      severity,
      area,
      category,
      nav.cursor,
    ),
    queryFn: () =>
      api.listVoices({
        limit: 10,
        visibility: 'GENERAL',
        sort: 'severity',
        ...dates,
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(category ? { category: category as never } : {}),
        ...(nav.cursor ? { cursor: nav.cursor } : {}),
      }),
    enabled: !!session,
    refetchInterval: 3000,
  });

  const setParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('cursor');
    params.delete('cursorHistory');
    setSearchParams(params);
  };

  const items = list.data?.items ?? [];
  const nextCursor = list.data?.nextCursor ?? null;
  const data = chart.data;

  return (
    <Stack gap="lg">
      <HeroBand
        eyebrow="General Voice"
        title="Tinjauan General"
        description="Aggregate dan detail General Voice bersifat read-only untuk Union."
        chip={
          <HeroChip icon={<ShieldCheck size={12} aria-hidden="true" />} label="Union · Read-only" />
        }
        updated={data ? `Diperbarui ${formatRelative(data.generatedAt)}` : undefined}
        inset={
          data ? (
            <HeroInset title="Ringkasan organisasi" ariaLabel="Ringkasan organisasi">
              <KpiTrio
                ariaLabel="Ringkasan organisasi"
                items={generalKpiItems(data.status, data.total)}
              />
            </HeroInset>
          ) : chart.isLoading ? (
            <Skeleton label="Memuat aggregate" />
          ) : null
        }
      />

      <FilterPillRow
        primary={[
          {
            id: 'area',
            label: 'Seluruh organisasi',
            value: area ?? '',
            onValueChange: (value) => setParam('area', value || undefined),
            options: Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            id: 'range',
            label: 'Rentang',
            value: range,
            onValueChange: (value) => setParam('range', value),
            options: Object.entries(RANGE_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
        secondary={[
          {
            id: 'status',
            label: 'Status',
            value: status ?? '',
            onValueChange: (value) => setParam('status', value || undefined),
            options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            id: 'severity',
            label: 'Severity',
            value: severity ?? '',
            onValueChange: (value) => setParam('severity', value || undefined),
            options: Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
        onClear={() => setSearchParams(new URLSearchParams(searchParams))}
        customContent={
          range === 'custom' ? (
            <div className="filter-pills__dates">
              <Input
                label="Dari tanggal"
                type="date"
                value={customFrom ?? ''}
                onChange={(event) => setParam('dashFrom', event.target.value || undefined)}
              />
              <Input
                label="Sampai tanggal"
                type="date"
                value={customTo ?? ''}
                onChange={(event) => setParam('dashTo', event.target.value || undefined)}
              />
            </div>
          ) : undefined
        }
      />

      {data ? (
        <>
          <Card className="distribution-card" padding="md">
            <h3 className="attention-card__title">Status</h3>
            <StatusDistribution buckets={data.status} />
          </Card>

          <AttentionCard
            title="Kategori utama"
            ariaLabel="Kategori utama"
            rows={categoryRows(data, (value) => setParam('category', value))}
          />

          <TrendCard
            title={`Trend ${range === 'custom' ? 'rentang kustom' : RANGE_LABELS[range].toLowerCase()}`}
            buckets={data.trend}
            total={data.total}
            previousTotal={data.previousTotal}
          />

          {items.length ? (
            <AttentionCard
              title="Perlu perhatian"
              ariaLabel="Perlu perhatian"
              rows={items.slice(0, 3).map((voice) => ({
                key: voice.id,
                icon: voice.severity === 'CRITICAL' ? <Activity /> : <ScrollText />,
                label: voice.title,
                description: AREA_LABELS[voice.area] ?? voice.area,
                tone: voice.severity === 'CRITICAL' ? ('danger' as const) : ('neutral' as const),
                value: SEVERITY_LABELS[voice.severity] ?? voice.severity,
                onClick: () => void navigate(`/voices/${voice.id}`),
              }))}
            />
          ) : null}

          <p className="info-banner">
            <ShieldCheck size={15} aria-hidden="true" />
            Data General Voice dapat dilihat tanpa aksi operasional.
          </p>

          {data.suppression.enabled &&
          (data.suppression.division.suppressedValue > 0 ||
            data.suppression.department.suppressedValue > 0) ? (
            <p className="care-note">
              Kelompok kecil digabungkan (ambang {data.suppression.threshold}) demi privasi.
            </p>
          ) : null}
        </>
      ) : chart.isError ? (
        <Alert tone="danger" title="Aggregate gagal dimuat">
          Coba muat ulang halaman.
        </Alert>
      ) : null}

      {list.isLoading ? (
        <Skeleton label="Memuat daftar" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText size={24} />}
            title="Tidak ada General Voice"
            description="Belum ada General Voice pada scope ini."
          />
        </Card>
      ) : (
        <Stack gap="md">
          <div className="inbox-list">
            {items.map((voice) => (
              <InboxVoiceCard
                key={voice.id}
                voice={voice}
                showPic={false}
                onOpen={() => void navigate(`/voices/${voice.id}`)}
              />
            ))}
          </div>
          <Pager
            page={nav.page}
            hasPrevious={nav.canPrevious}
            hasNext={Boolean(nextCursor)}
            onPrevious={() => nav.previous()}
            onNext={nextCursor ? () => nav.next(nextCursor) : undefined}
            loading={list.isFetching}
          />
        </Stack>
      )}
    </Stack>
  );
}

function categoryRows(data: DashboardAggregate, onPick: (value: string) => void) {
  return data.category
    .filter((bucket) => bucket.label !== 'OTHER_SUPPRESSED')
    .sort((a, b) => b.value - a.value)
    .map((bucket) => ({
      key: bucket.label,
      icon: CATEGORY_ICONS[bucket.label] ?? <ScrollText />,
      label:
        bucket.label === 'NONE'
          ? 'Tanpa kategori'
          : (CATEGORY_LABELS[bucket.label] ?? bucket.label),
      tone: 'brand' as const,
      value: bucket.value,
      onClick: bucket.label === 'NONE' ? undefined : () => onPick(bucket.label),
    }));
}
