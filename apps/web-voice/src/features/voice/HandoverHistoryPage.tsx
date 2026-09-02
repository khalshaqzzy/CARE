import { Button, Card, EmptyState, Skeleton, Stack } from '@care/ui';
import { ArrowLeft, LockKeyhole, Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { HandoverHistoryList } from '../../components/HandoverHistoryList';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';

export function HandoverHistoryPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const history = useQuery({
    queryKey: voiceQuery(sessionId, 'handovers', id),
    queryFn: () => api.handovers(id),
    enabled: Boolean(id),
  });

  return (
    <div className="handover-history-page">
      <header className="handover-history-page__header">
        <Button variant="ghost" onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} /> Kembali
        </Button>
        <span className="handover-history-page__icon">
          <Send size={22} aria-hidden="true" />
        </span>
        <div>
          <span>Riwayat privat</span>
          <h1>{history.data?.voice.displayId ?? 'Handover Voice'}</h1>
          <p>
            Hanya transfer yang melibatkan Anda yang ditampilkan bila akses Voice sudah berakhir.
          </p>
        </div>
      </header>
      <Stack gap="md" className="handover-history-page__content">
        <p className="handover-history-page__privacy">
          <LockKeyhole size={15} /> Detail setiap transfer hanya terlihat oleh kedua PIC terkait.
        </p>
        {history.isLoading ? (
          <Skeleton label="Memuat riwayat handover" />
        ) : history.isError ? (
          <Card>
            <EmptyState
              title="Riwayat tidak dapat dibuka"
              description="Anda tidak memiliki akses ke riwayat handover ini."
            />
          </Card>
        ) : history.data?.items.length ? (
          <HandoverHistoryList items={history.data.items} />
        ) : (
          <Card>
            <EmptyState
              title="Belum ada handover"
              description="Riwayat transfer Voice akan tampil di sini."
            />
          </Card>
        )}
      </Stack>
    </div>
  );
}
