import { Alert, Button, ChoiceCardGroup, Input, Stack } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, UserRound } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';

/** Today's WIB calendar day as YYYY-MM-DD. */
function todayKey() {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * "Sedang tidak masuk": a leader names a substitute for a period; the
 * substitute handles their Voices until the period ends or "Aktif kembali".
 */
export function AwayPage() {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: voiceQuery(sessionId, 'away'),
    queryFn: () => api.away(),
  });
  const [startsOn, setStartsOn] = useState(todayKey());
  const [endsOn, setEndsOn] = useState(todayKey());
  const [substituteId, setSubstituteId] = useState('');
  const save = useMutation({
    mutationFn: (action: 'set' | 'end') =>
      action === 'set' ? api.setAway({ startsOn, endsOn, substituteId }) : api.endAway(),
    onSuccess: (data) => queryClient.setQueryData(voiceQuery(sessionId, 'away'), data),
  });
  const error = save.error instanceof Error ? save.error.message : null;
  const data = status.data;
  const current = data?.current ?? null;

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <h1>Sedang tidak masuk</h1>
      </header>
      {status.isLoading ? <p className="dialog-copy">Memuat…</p> : null}
      {error ? (
        <Alert tone="danger" title="Belum tersimpan">
          {error}
        </Alert>
      ) : null}
      {data && !data.eligible ? (
        <Alert tone="info" title="Tidak tersedia">
          Hanya untuk Group Leader ke atas.
        </Alert>
      ) : null}
      {current ? (
        <section className="away-card" aria-label="Status tidak masuk">
          <span className="away-card__icon" aria-hidden="true">
            <CalendarOff size={20} />
          </span>
          <div>
            <strong>{current.active ? 'Anda sedang tidak masuk' : 'Tidak masuk terjadwal'}</strong>
            <p>
              {formatDate(current.startsOn)} – {formatDate(current.endsOn)} · Pengganti{' '}
              <strong>{current.substitute.displayName}</strong>
            </p>
          </div>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate('end')}>
            {current.active ? 'Aktif kembali' : 'Batalkan'}
          </Button>
        </section>
      ) : data?.eligible ? (
        <section className="away-form" aria-label="Atur periode">
          <div className="away-form__dates">
            <Input
              label="Mulai"
              type="date"
              min={todayKey()}
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
            <Input
              label="Selesai"
              type="date"
              min={startsOn}
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </div>
          {data.candidates.length ? (
            <ChoiceCardGroup
              label="Pengganti"
              value={substituteId}
              onValueChange={setSubstituteId}
              columns={1}
              indicator="radio"
              appearance="brand"
              options={data.candidates.map((candidate) => ({
                value: candidate.id,
                label: candidate.displayName,
                description: [candidate.position, candidate.section].filter(Boolean).join(' · '),
                icon: <UserRound size={18} />,
              }))}
            />
          ) : (
            <Alert tone="warning" title="Belum ada pengganti">
              Tidak ada rekan yang dapat menggantikan Anda.
            </Alert>
          )}
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!substituteId || !startsOn || !endsOn || endsOn < startsOn}
            onClick={() => save.mutate('set')}
          >
            Aktifkan
          </Button>
        </section>
      ) : null}
    </Stack>
  );
}
