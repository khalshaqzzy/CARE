import { Badge, Button, Card, EmptyState, Skeleton, Stack } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { Pager } from '../../components/Pager';
import { formatDateTime } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import { PushSettingsCard } from './PushSettingsCard';

const TYPE_LABELS: Record<string, string> = {
  VOICE_SUBMITTED: 'Voice baru',
  ASSIGNED: 'Penugasan',
  MESSAGE: 'Pesan',
  STATUS_CHANGED: 'Status',
  CLOSED: 'Penutupan',
  RATED: 'Rating',
  REOPENED: 'Dibuka kembali',
  SECURITY: 'Keamanan',
};

export function NotificationsPage() {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useCursorPagination(searchParams, setSearchParams);

  const unread = useQuery({
    queryKey: voiceQuery(sessionId, 'notifications', 'unread'),
    queryFn: () => api.unreadCount(),
    enabled: !!session,
    refetchInterval: 3000,
  });

  const list = useQuery({
    queryKey: voiceQuery(sessionId, 'notifications', nav.cursor),
    queryFn: () => api.notifications({ limit: 20, ...(nav.cursor ? { cursor: nav.cursor } : {}) }),
    enabled: !!session,
    refetchInterval: 3000,
  });

  const markAll = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'notifications') });
    },
  });

  const markRead = useMutation({
    mutationFn: (itemId: string) => api.markRead(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'notifications') });
    },
  });

  const items = list.data?.items ?? [];
  const nextCursor = list.data?.nextCursor ?? null;

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">Notifikasi</p>
        <h1>Pusat notifikasi</h1>
        <p>
          {unread.data?.count
            ? `${unread.data.count} belum dibaca`
            : 'Semua notifikasi sudah dibaca'}
        </p>
      </header>

      {unread.data?.count ? (
        <Button variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending}>
          <CheckCheck size={18} /> Tandai semua dibaca
        </Button>
      ) : null}

      <PushSettingsCard />

      {list.isLoading ? (
        <Skeleton label="Memuat notifikasi" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell size={24} />}
            title="Belum ada notifikasi"
            description="Pembaruan akun akan muncul di sini."
          />
        </Card>
      ) : (
        <Stack gap="md">
          <div className="notification-list">
            {items.map((notification) => {
              const isRead = Boolean(notification.readAt);
              return (
                <Card
                  key={notification.id}
                  className={isRead ? 'notification is-read' : 'notification is-unread'}
                  interactive
                >
                  <div className="notification__main">
                    <div className="notification__head">
                      <Badge tone={isRead ? 'neutral' : 'info'}>
                        {TYPE_LABELS[notification.type] ?? notification.type}
                      </Badge>
                      <time dateTime={notification.createdAt}>
                        {formatDateTime(notification.createdAt)}
                      </time>
                    </div>
                    <h3 className="notification__title">{notification.title}</h3>
                    <p className="notification__body">{notification.body}</p>
                  </div>
                  {!isRead ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        markRead.mutate(notification.id);
                        if (notification.deepLink) void navigate(notification.deepLink);
                      }}
                    >
                      Buka
                    </Button>
                  ) : null}
                </Card>
              );
            })}
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
