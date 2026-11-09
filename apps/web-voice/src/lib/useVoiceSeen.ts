import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useUnreadNotificationCount } from '../features/notifications/NotificationBell';
import { useApi, useSessionId, voiceQuery } from './query';

/**
 * Opening a Voice from anywhere (lists, Home, push, notification centre) reads
 * its notifications, except chat ones which the chat page reads. Runs again
 * when the Voice changes, a new notification arrives, or the app comes back
 * to the foreground, so the bell and Home Screen badge drop right away.
 */
export function useMarkVoiceSeen(voiceId: string | undefined, revision: string | undefined) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const unread = useUnreadNotificationCount();
  useEffect(() => {
    if (!voiceId || revision === undefined) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      void api
        .markVoiceSeen(voiceId)
        .then((result) => {
          if (result.updated)
            void queryClient.invalidateQueries({
              queryKey: voiceQuery(sessionId, 'notifications'),
            });
        })
        .catch(() => undefined);
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [api, queryClient, sessionId, voiceId, revision, unread]);
}
