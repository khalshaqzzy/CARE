import { Button } from '@care/ui';
import { useAuth } from '@care/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';

/**
 * Unread notification count. The query key matches NotificationsPage so
 * marking items read refreshes every indicator.
 */
export function useUnreadNotificationCount(): number {
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const unread = useQuery({
    queryKey: voiceQuery(sessionId, 'notifications', 'unread'),
    queryFn: () => api.unreadCount(),
    enabled: !!session,
    refetchInterval: 5000,
  });
  return unread.data?.count ?? 0;
}

/** Hero bell with a highlighted unread count. */
export function NotificationBellButton() {
  const navigate = useNavigate();
  const count = useUnreadNotificationCount();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="member-hero__orb member-hero__bell"
      aria-label={count > 0 ? `Lihat notifikasi, ${count} belum dibaca` : 'Lihat notifikasi'}
      onClick={() => void navigate('/notifications')}
    >
      <Bell size={20} />
      {count > 0 ? (
        <span className="unread-badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Button>
  );
}
