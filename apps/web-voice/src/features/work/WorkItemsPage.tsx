import { Card, EmptyState, Input, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { Pager } from '../../components/Pager';
import { VoiceCard } from '../../components/VoiceCard';
import { AREA_LABELS, STATUS_LABELS, SEVERITY_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';

export function WorkItemsPage() {
  const { session } = useAuth();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useCursorPagination(searchParams, setSearchParams);

  const status = searchParams.get('status') ?? undefined;
  const severity = searchParams.get('severity') ?? undefined;
  const area = searchParams.get('area') ?? undefined;
  const search = searchParams.get('search') ?? undefined;

  const inbox = useQuery({
    queryKey: voiceQuery(sessionId, 'work-items', status, severity, area, search, nav.cursor),
    queryFn: () =>
      api.workItems({
        limit: 10,
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(search ? { search } : {}),
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

  const items = inbox.data?.items ?? [];
  const nextCursor = inbox.data?.nextCursor ?? null;

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">Inbox operasional</p>
        <h1>Voice Member</h1>
        <p>Voice yang menjadi tanggung jawab Anda diurutkan berdasarkan prioritas severity.</p>
      </header>

      <Card className="history-filters">
        <div className="history-filters__row">
          <div className="history-filters__search">
            <Input
              label="Cari"
              value={search ?? ''}
              onChange={(event) => setParam('search', event.target.value || undefined)}
              leading={<Search size={16} />}
            />
          </div>
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

      {inbox.isLoading ? (
        <Skeleton label="Memuat inbox" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={24} />}
            title="Inbox kosong"
            description="Tidak ada Voice yang ditugaskan kepada Anda."
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
            loading={inbox.isFetching}
          />
        </Stack>
      )}
    </Stack>
  );
}
