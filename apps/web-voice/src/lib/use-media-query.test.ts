import { describe, expect, it, vi } from 'vitest';
import { createMediaQueryStore } from './use-media-query';

function stubMediaList(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: Event) => void>();
  return {
    scope: {
      matchMedia: () => ({
        get matches() {
          return matches;
        },
        addEventListener: (_type: 'change', listener: (event: Event) => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: 'change', listener: (event: Event) => void) => {
          listeners.delete(listener);
        },
      }),
    },
    flip(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener(new Event('change')));
    },
    subscriberCount() {
      return listeners.size;
    },
  };
}

describe('createMediaQueryStore', () => {
  it('reports the current match state through getSnapshot', () => {
    const stub = stubMediaList(true);
    const store = createMediaQueryStore('(min-width: 1280px)', stub.scope);
    expect(store.getSnapshot()).toBe(true);
  });

  it('notifies subscribers when the query crosses the breakpoint and stops after unsubscribe', () => {
    const stub = stubMediaList(false);
    const store = createMediaQueryStore('(min-width: 1280px)', stub.scope);
    const onChange = vi.fn();

    const unsubscribe = store.subscribe(onChange);
    expect(stub.subscriberCount()).toBe(1);

    stub.flip(true);
    expect(onChange).toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(true);

    unsubscribe();
    expect(stub.subscriberCount()).toBe(0);
  });

  it('falls back to a non-matching snapshot when matchMedia is unavailable', () => {
    const store = createMediaQueryStore('(min-width: 1280px)', {});
    expect(store.getSnapshot()).toBe(false);
    const unsubscribe = store.subscribe(vi.fn());
    unsubscribe();
  });
});
