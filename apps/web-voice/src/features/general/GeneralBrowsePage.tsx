import { Card, EmptyState, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { DashboardChartCard } from '../../components/DashboardChartCard';
import { Pager } from '../../components/Pager';
import { VoiceCard } from '../../components/VoiceCard';
import { AREA_LABELS, formatRelative, SEVERITY_LABELS, STATUS_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import type { DashboardAggregate } from '../../workforce-api';

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

  const chart = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'general', status, severity, area),
    queryFn: () =>
      api.dashboardGeneral({
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
      }),
    enabled: !!session,
    refetchInterval: 3000,
  });

  const list = useQuery({
    queryKey: voiceQuery(sessionId, 'general', status, severity, area, nav.cursor),
    queryFn: () =>
      api.listVoices({
        limit: 10,
        visibility: 'GENERAL',
        sort: 'severity',
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
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

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">General Voice</p>
        <h1>Tinjauan General</h1>
        <p>Aggregate dan detail General Voice bersifat read-only untuk Union dan Leadership.</p>
      </header>

      {chart.data ? (
        <div className="home-dash-row">
          <DashboardChartCard title="Status" buckets={chart.data.status} total={chart.data.total} />
          <DashboardChartCard title="Severity" buckets={chart.data.severity} />
          <DashboardChartCard title="Kategori" buckets={chart.data.category} />
        </div>
      ) : (
        <Skeleton label="Memuat aggregate" />
      )}

      {chart.data ? <DashboardNote data={chart.data} /> : null}

      <Card className="history-filters">
        <div className="history-filters__row">
          <Select
            label="Status"
            value={status ?? ''}
            onValueChange={(value) => setParam('status', value || undefined)}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Severity"
            value={severity ?? ''}
            onValueChange={(value) => setParam('severity', value || undefined)}
            options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Area"
            value={area ?? ''}
            onValueChange={(value) => setParam('area', value || undefined)}
            options={Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </Card>

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
          <div className="voice-grid">
            {items.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
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

function DashboardNote({ data }: { data: DashboardAggregate }) {
  const suppressed =
    data.suppression.enabled &&
    (data.suppression.division.suppressedValue > 0 ||
      data.suppression.department.suppressedValue > 0);
  return (
    <p className="care-note">
      {suppressed
        ? `Kelompok kecil digabungkan (ambang ${data.suppression.threshold}) demi privasi. `
        : ''}
      Diperbarui {formatRelative(data.generatedAt)}.
    </p>
  );
}
