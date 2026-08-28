import { QueryClient } from '@tanstack/react-query';

export const sessionQueryKey = ['session'] as const;

export function careQueryKey(sessionId: string, ...parts: readonly unknown[]) {
  return ['care-session', sessionId, ...parts] as const;
}

export function createCareQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry(failureCount, error) {
          const kind =
            typeof error === 'object' && error && 'kind' in error ? error.kind : undefined;
          return (
            !['unauthenticated', 'not-found', 'offline'].includes(String(kind)) && failureCount < 2
          );
        },
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export function clearSessionBoundQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'care-session' });
}

export async function clearPersistentUserState() {
  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith('care-user-')).map((name) => caches.delete(name)),
    );
  }
  if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name?.startsWith('care-user-')))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve();
            }),
        ),
    );
  }
}
