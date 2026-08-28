import { Alert, Card, EmptyState, Input, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Lock, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { Pager } from '../../components/Pager';
import { VoiceCard } from '../../components/VoiceCard';
import { AREA_LABELS, STATUS_LABELS, SEVERITY_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import { useOnlineStatus } from '../../lib/use-online-status';

export function WorkItemsPage() {
  const { session } = useAuth();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useCursorPagination(searchParams, setSearchParams);
  const offline = !useOnlineStatus();

  const caps = session?.capabilities ?? [];
  const isUnion = caps.some((c) => c === 'UNION_HEAD' || c === 'UNION_OFFICER');
  const isUnionHead = caps.includes('UNION_HEAD');
  // The unassigned queue is a Union Head concept; the flag is ignored server-side
  // for every other actor.
  const unassignedOnly = isUnionHead && searchParams.get('unassigned') === 'true';

  const status = searchParams.get('status') ?? undefined;
  const severity = searchParams.get('severity') ?? undefined;
  const area = searchParams.get('area') ?? undefined;
  const search = searchParams.get('search') ?? undefined;

  const inbox = useQuery({
    queryKey: voiceQuery(
      sessionId,
      'work-items',
      status,
      severity,
      area,
      search,
      unassignedOnly ? 'unassigned' : 'all',
      nav.cursor,
    ),
    queryFn: () =>
      api.workItems({
        limit: 10,
        ...(status ? { status: status as never } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(search ? { search } : {}),
        ...(unassignedOnly ? { unassigned: 'true' } : {}),
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

  const intro = isUnionHead
    ? {
        eyebrow: 'Union',
        title: 'Private Voice',
        description: unassignedOnly
          ? 'Private Voice yang masih menunggu penugasan Union Officer.'
          : 'Seluruh Private Voice melalui Union Head, diurutkan berdasarkan severity.',
      }
    : isUnion
      ? {
          eyebrow: 'Union',
          title: 'Private Voice',
          description: 'Private Voice yang ditugaskan kepada Anda untuk ditangani.',
        }
      : {
          eyebrow: 'Inbox operasional',
          title: 'Voice Member',
          description:
            'Voice yang menjadi tanggung jawab Anda diurutkan berdasarkan prioritas severity.',
        };

  const emptyState = unassignedOnly
    ? {
        icon: <Lock size={24} />,
        title: 'Semua Private Voice sudah ditugaskan',
        description: 'Tidak ada Private Voice yang menunggu penugasan Union Officer.',
      }
    : isUnionHead
      ? {
          icon: <Lock size={24} />,
          title: 'Belum ada Private Voice',
          description: 'Private Voice dari reporter akan muncul di sini untuk ditindaklanjuti.',
        }
      : isUnion
        ? {
            icon: <Inbox size={24} />,
            title: 'Belum ada penugasan',
            description: 'Private Voice yang ditugaskan kepada Anda akan muncul di sini.',
          }
        : {
            icon: <Inbox size={24} />,
            title: 'Inbox kosong',
            description: 'Tidak ada Voice yang ditugaskan kepada Anda.',
          };

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">{intro.eyebrow}</p>
        <h1>{intro.title}</h1>
        <p>{intro.description}</p>
      </header>

      {offline ? (
        <Alert tone="warning" title="Anda sedang offline">
          Daftar terbaru dan seluruh tindakan memerlukan koneksi.
        </Alert>
      ) : null}

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
          {isUnionHead ? (
            <Select
              label="Penugasan"
              value={unassignedOnly ? 'unassigned' : 'all'}
              onValueChange={(value) =>
                setParam('unassigned', value === 'unassigned' ? 'true' : undefined)
              }
              options={[
                { value: 'all', label: 'Semua' },
                { value: 'unassigned', label: 'Perlu ditugaskan' },
              ]}
            />
          ) : null}
        </div>
      </Card>

      {inbox.isLoading ? (
        <Skeleton label="Memuat daftar" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState {...emptyState} />
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
