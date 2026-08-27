import { careQueryKey, useAuth } from '@care/frontend-core';
import { useMemo } from 'react';
import { createWorkforceApi } from '../workforce-api';

export function useApi() {
  const { transport } = useAuth();
  return useMemo(() => createWorkforceApi(transport), [transport]);
}

export function useSessionId(): string {
  const { session } = useAuth();
  return session?.sessionId ?? 'anon';
}

export function voiceQuery(sessionId: string, ...parts: readonly unknown[]) {
  return careQueryKey(sessionId, 'voice', ...parts);
}

export function idempotencyKey(namespace: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${namespace}-${crypto.randomUUID()}`;
  return `${namespace}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
