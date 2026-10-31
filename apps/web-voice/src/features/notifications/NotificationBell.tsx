import { Button } from '@care/ui';
import { useAuth } from '@care/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateAppBadge } from '../../lib/push-payload';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';

/**
 * Unread notification count. The query key matches NotificationsPage so
 * marking items read refreshes every indicator.
 */
function useUnreadNotificationQuery() {
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  return useQuery({
    queryKey: voiceQuery(sessionId, 'notifications', 'unread'),
    queryFn: () => api.unreadCount(),
    enabled: !!session,
    refetchInterval: 5000,
  });
}

export function useUnreadNotificationCount(): number {
  return useUnreadNotificationQuery().data?.count ?? 0;
}

/**
 * Mirrors the unread count onto the Home Screen icon while CARE is open, so
 * reading notifications here clears the badge set by the service worker.
 * Once nothing is unread, banners still in the tray are closed too, which
 * also clears the dot Android launchers draw for them.
 */
export function AppBadgeSync(): null {
  const count = useUnreadNotificationQuery().data?.count;
  useEffect(() => {
    if (count === undefined) return;
    void updateAppBadge(navigator as Parameters<typeof updateAppBadge>[0], count);
    if (count === 0) void closeTrayNotifications();
  }, [count]);
  useEffect(
    () => () => void updateAppBadge(navigator as Parameters<typeof updateAppBadge>[0], 0),
    [],
  );
  return null;
}

async function closeTrayNotifications() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const shown = (await registration?.getNotifications()) ?? [];
    for (const notification of shown) notification.close();
  } catch {
    // Best-effort; the tray is the OS's to manage.
  }
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
