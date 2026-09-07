import { Button, Card, EmptyState, Skeleton, Stack } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Send,
  Star,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { Pager } from '../../components/Pager';
import { formatNotificationTime } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import { PushSettingsCard } from './PushSettingsCard';

/** Icon + tone per notification type; unknown types fall back to a neutral bell. */
const TYPE_ICONS: Record<string, { icon: React.ReactNode; tone: string }> = {
  VOICE_SUBMITTED: { icon: <Inbox />, tone: 'info' },
  ASSIGNED: { icon: <ClipboardCheck />, tone: 'info' },
  HANDOVER_RECEIVED: { icon: <Send />, tone: 'info' },
  MESSAGE: { icon: <MessageSquare />, tone: 'info' },
  STATUS_CHANGED: { icon: <RefreshCw />, tone: 'warning' },
  CLOSED: { icon: <CheckCircle2 />, tone: 'success' },
  RATED: { icon: <Star />, tone: 'warning' },
  REOPENED: { icon: <RotateCcw />, tone: 'warning' },
  SECURITY: { icon: <ShieldAlert />, tone: 'danger' },
};

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayKey = (value: string) => dayKeyFormatter.format(new Date(value));

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  deepLink?: string | null;
};

/** Groups the feed into "Hari ini" and everything earlier (screen 15). */
function groupByDay(items: NotificationItem[]) {
  const today = dayKey(new Date().toISOString());
  const todayItems = items.filter((item) => dayKey(item.createdAt) === today);
  const previousItems = items.filter((item) => dayKey(item.createdAt) !== today);
  return [
    { label: 'Hari ini', items: todayItems },
    { label: 'Sebelumnya', items: previousItems },
  ].filter((group) => group.items.length > 0);
}

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

  const items = (list.data?.items ?? []) as NotificationItem[];
  const nextCursor = list.data?.nextCursor ?? null;
  const unreadCount = unread.data?.count ?? 0;
  const groups = groupByDay(items);

  return (
    <Stack gap="lg">
      <header className="page-intro page-intro--monitoring">
        <div>
          <p className="care-eyebrow">Notifikasi</p>
          <h1>Pusat notifikasi</h1>
          <p>{unreadCount ? `${unreadCount} belum dibaca` : 'Semua notifikasi sudah dibaca'}</p>
        </div>
        {unreadCount ? (
          <Button
            variant="ghost"
            size="sm"
            className="notification-markall"
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
          >
            <CheckCheck size={16} /> Tandai semua dibaca
          </Button>
        ) : null}
      </header>

      <PushSettingsCard />

      {list.isLoading ? (
        <Skeleton label="Memuat notifikasi" />
      ) : items.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<Bell size={24} />}
            title="Belum ada notifikasi"
            description="Pembaruan akun akan muncul di sini."
          />
        </Card>
      ) : (
        <Stack gap="md">
          {groups.map((group) => (
            <section key={group.label} className="notification-group">
              <h2 className="notification-group__title">{group.label}</h2>
              <Card className="notification-group__card">
                <ul className="notification-group__list" role="list">
                  {group.items.map((notification) => {
                    const isRead = Boolean(notification.readAt);
                    const visual = TYPE_ICONS[notification.type] ?? {
                      icon: <Bell />,
                      tone: 'neutral',
                    };
                    return (
                      <li
                        key={notification.id}
                        className={
                          isRead ? 'notification-row is-read' : 'notification-row is-unread'
                        }
                      >
                        <span className="notification-row__dot" aria-hidden="true" />
                        <span
                          className="notification-row__icon"
                          data-tone={visual.tone}
                          aria-hidden="true"
                        >
                          {visual.icon}
                        </span>
                        <div className="notification-row__main">
                          <h3 className="notification-row__title">{notification.title}</h3>
                          <p className="notification-row__body">{notification.body}</p>
                          {!isRead ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="notification-row__open"
                              onClick={() => {
                                markRead.mutate(notification.id);
                                if (notification.deepLink) void navigate(notification.deepLink);
                              }}
                            >
                              Buka
                            </Button>
                          ) : null}
                        </div>
                        <time className="notification-row__time" dateTime={notification.createdAt}>
                          {formatNotificationTime(notification.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
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
