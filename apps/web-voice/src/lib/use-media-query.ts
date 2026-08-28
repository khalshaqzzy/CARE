import { useSyncExternalStore } from 'react';

/**
 * Reactive media-query state. `useSyncExternalStore` re-renders the shell the
 * moment the viewport crosses the breakpoint, instead of waiting for an
 * unrelated re-render of a stale one-shot `matchMedia` read.
 */
export function createMediaQueryStore(query: string, scope?: Pick<Window, 'matchMedia'>) {
  const mediaList =
    scope?.matchMedia?.(query) ??
    (typeof window !== 'undefined' ? window.matchMedia?.(query) : null) ??
    null;
  return {
    subscribe(onStoreChange: () => void) {
      mediaList?.addEventListener?.('change', onStoreChange);
      return () => mediaList?.removeEventListener?.('change', onStoreChange);
    },
    getSnapshot() {
      return mediaList?.matches ?? false;
    },
  };
}

const storeCache = new Map<string, ReturnType<typeof createMediaQueryStore>>();

/** The workforce desktop breakpoint shared by the shell and the topbar logic. */
export const desktopQuery = '(min-width: 1280px)';

export function useMediaQuery(query: string): boolean {
  let store = storeCache.get(query);
  if (!store) {
    store = createMediaQueryStore(query);
    storeCache.set(query, store);
  }
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.getSnapshot(),
    () => false,
  );
}
