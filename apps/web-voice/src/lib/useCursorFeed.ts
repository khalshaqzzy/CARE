import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Consumes a cursor-paginated "newest-first" (`order=desc`) feed.
 *
 * The first page is fetched via `useQuery` (so it auto-refreshes with
 * `refetchInterval`), while older pages are accumulated one-at-a-time through
 * `loadMore`, which reuses the previous page's `nextCursor`. Returned `items`
 * are in descending (newest-first) order across everything loaded; callers
 * reverse for newest-at-bottom rendering.
 */
export function useCursorFeed<T>({
  queryKey,
  fetchPage,
  enabled,
  refetchInterval,
  resetKey,
}: {
  queryKey: readonly unknown[];
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>;
  enabled: boolean;
  refetchInterval?: number;
  resetKey: string;
}) {
  const query = useQuery({
    queryKey,
    queryFn: () => fetchPage(undefined),
    enabled,
    ...(refetchInterval ? { refetchInterval } : {}),
  });
  const [older, setOlder] = useState<T[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);

  const loadOlder = useMutation({
    mutationFn: (cursor: string) => fetchPage(cursor),
    onSuccess: (page) => {
      // Pages are fetched newest-page-first; appending keeps `older` descending.
      setOlder((current) => [...current, ...page.items]);
      setOlderCursor(page.nextCursor);
    },
  });

  useEffect(() => {
    setOlder([]);
    setOlderCursor(null);
  }, [resetKey]);

  const latest = query.data?.items ?? [];
  // Descending newest-first: latest page first, then the accumulated older pages.
  const items = [...latest, ...older];
  const canLoadMore = Boolean(olderCursor ?? query.data?.nextCursor ?? null);

  return {
    items,
    canLoadMore,
    loadMore: () => {
      const cursor = olderCursor ?? query.data?.nextCursor;
      if (cursor) loadOlder.mutate(cursor);
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching || loadOlder.isPending,
    error: query.error,
  };
}
