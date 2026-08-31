import { Button, Card, EmptyState, Input, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Flag, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HistoryVoiceCard } from '../../components/HistoryVoiceCard';
import { Pager } from '../../components/Pager';
import { AREA_LABELS, STATUS_LABELS, SEVERITY_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';

export function HistoryPage() {
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useCursorPagination(searchParams, setSearchParams);

  const status = searchParams.get('status') ?? undefined;
  const severity = searchParams.get('severity') ?? undefined;
  const area = searchParams.get('area') ?? undefined;
  const search = searchParams.get('search') ?? undefined;

  const voices = useQuery({
    queryKey: voiceQuery(sessionId, 'voices', status, severity, area, search, nav.cursor),
    queryFn: () =>
      api.listVoices({
        limit: 10,
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(search ? { search } : {}),
        ...(nav.cursor ? { cursor: nav.cursor } : {}),
        visibility: undefined,
        sort: 'severity',
      }),
  });

  const setParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('cursor');
    params.delete('cursorHistory');
    setSearchParams(params);
  };

  const items = voices.data?.items ?? [];
  const nextCursor = voices.data?.nextCursor ?? null;
  const hasFilters = Boolean(search || status || severity || area);

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">Voice Saya</p>
        <h1>Voice milik Anda</h1>
      </header>

      <div className="history-toolbar">
        <Input
          label="Cari"
          hideLabel
          value={search ?? ''}
          onChange={(event) => setParam('search', event.target.value || undefined)}
          leading={<Search size={16} />}
          placeholder="Cari ID atau judul"
          aria-label="Cari berdasarkan ID atau judul"
        />
        <div className="history-toolbar__filters">
          <Select
            label="Status"
            hideLabel
            value={status ?? ''}
            onValueChange={(value) => setParam('status', value || undefined)}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            leading={<SlidersHorizontal size={15} />}
            placeholder="Status"
          />
          <Select
            label="Severity"
            hideLabel
            value={severity ?? ''}
            onValueChange={(value) => setParam('severity', value || undefined)}
            options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
            leading={<Flag size={15} />}
            placeholder="Severity"
          />
          <Select
            label="Area"
            hideLabel
            value={area ?? ''}
            onValueChange={(value) => setParam('area', value || undefined)}
            options={Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }))}
            leading={<MapPin size={15} />}
            placeholder="Area"
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="history-toolbar__clear"
              onClick={() => setSearchParams(new URLSearchParams())}
            >
              Bersihkan
            </Button>
          ) : null}
        </div>
      </div>

      {voices.isLoading ? (
        <Skeleton label="Memuat riwayat" />
      ) : voices.isError ? (
        <EmptyState title="Gagal memuat riwayat" description="Coba muat ulang halaman." />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={24} />}
            title="Belum ada Voice"
            description="Voice yang Anda laporkan akan muncul di sini."
          />
        </Card>
      ) : (
        <Stack gap="md">
          <div className="history-list">
            {items.map((voice) => (
              <HistoryVoiceCard
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
            loading={voices.isFetching}
          />
        </Stack>
      )}
    </Stack>
  );
}
