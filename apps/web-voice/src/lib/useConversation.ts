import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi, useMutationKey, useSessionId, voiceQuery } from './query';
import { useCursorFeed } from './useCursorFeed';
import type { Message } from '../workforce-api';

const PAGE_SIZE = 50;

/**
 * Shared conversation feed + send mutation for the dedicated chat page and
 * the detail-page conversation summary. One query key means one poller and a
 * shared cache across both surfaces. `items` is oldest-first for rendering.
 */
export function useConversation(voiceId: string) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const messageKey = useMutationKey('message');

  const feed = useCursorFeed<Message>({
    queryKey: voiceQuery(sessionId, 'voice', voiceId, 'messages'),
    fetchPage: (cursor) =>
      api.voiceMessages(voiceId, {
        limit: PAGE_SIZE,
        order: 'desc',
        ...(cursor ? { cursor } : {}),
      }),
    enabled: Boolean(voiceId),
    refetchInterval: 3000,
    resetKey: voiceId,
  });

  const send = useMutation({
    mutationFn: ({ text, files }: { text: string; files: File[] }) =>
      api.sendMessage(voiceId, text, files, messageKey.key()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: voiceQuery(sessionId, 'voice', voiceId, 'messages'),
      });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', voiceId) });
    },
    onSettled: messageKey.reset,
  });

  // `feed.items` is newest-first; reverse so the newest message sits at the bottom.
  const items = useMemo(() => [...feed.items].reverse(), [feed.items]);

  return { feed, items, send };
}
