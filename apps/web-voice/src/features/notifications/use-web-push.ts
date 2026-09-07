import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  getInstallationId,
  isIos,
  isPushSupported,
  isStandalone,
  permissionState,
  subscriptionPayload,
  urlBase64ToUint8Array,
} from '../../lib/push';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { getBrowserCapabilities } from '../../lib/browser-capabilities';
import { SERVICE_WORKER_FAILURE_MARKER } from '../../register-sw';

type PushStatus = Awaited<ReturnType<ReturnType<typeof useApi>['pushStatus']>>;

/**
 * Drives the workforce Web Push opt-in/opt-out state machine while keeping the
 * in-app Notification Center authoritative. Subscribe/upsert and unsubscribe
 * are idempotent by nature (backend upsert / updateMany), so they need no
 * Idempotency-Key; they only run from an explicit user gesture.
 */
export function useWebPush() {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const capabilities = getBrowserCapabilities();
  const [serviceWorkerFailed, setServiceWorkerFailed] = useState(() => {
    try {
      return window.sessionStorage.getItem(SERVICE_WORKER_FAILURE_MARKER) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const degraded = () => setServiceWorkerFailed(true);
    const restored = () => setServiceWorkerFailed(false);
    window.addEventListener('care-sw-degraded', degraded);
    window.addEventListener('care-sw-restored', restored);
    return () => {
      window.removeEventListener('care-sw-degraded', degraded);
      window.removeEventListener('care-sw-restored', restored);
    };
  }, []);
  const canUsePushApi = capabilities.pushSupported && !serviceWorkerFailed;

  const publicKey = useQuery({
    queryKey: voiceQuery(sessionId, 'push', 'public-key'),
    queryFn: () => api.pushPublicKey(),
    staleTime: 60_000,
    enabled: canUsePushApi,
  });

  const status = useQuery({
    queryKey: voiceQuery(sessionId, 'push', 'status'),
    queryFn: () => api.pushStatus(),
    refetchInterval: 30_000,
    enabled: canUsePushApi,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'push') });
  };

  const subscribe = useMutation({
    mutationFn: async () => {
      const key = publicKey.data?.publicKey;
      if (!key) throw new Error('Notifikasi push belum dikonfigurasi.');
      if (!('serviceWorker' in navigator)) throw new Error('Browser tidak mendukung Web Push.');
      const registration = await navigator.serviceWorker.ready;
      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Izin notifikasi ditolak.');
      const applicationServerKey = urlBase64ToUint8Array(key);
      const browserSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const payload = subscriptionPayload(
        browserSubscription.endpoint,
        browserSubscription.toJSON().keys as { p256dh: string; auth: string },
      );
      return api.subscribePush(payload);
    },
    onSuccess: invalidate,
    onError: () => {
      // Permission denial and transient failures are surfaced as status, not a
      // silent queue. The in-app Notification Center remains authoritative.
    },
  });

  const unsubscribe = useMutation({
    mutationFn: async () => {
      const installationId = getInstallationId();
      try {
        const registration = await navigator.serviceWorker?.ready;
        const browserSubscription = await registration?.pushManager.getSubscription?.();
        await browserSubscription?.unsubscribe();
      } catch {
        // Best-effort browser unsubscribe; the server record is the source of truth.
      }
      return api.unsubscribePush(installationId);
    },
    onSuccess: invalidate,
  });

  const configured = Boolean(publicKey.data?.configured);
  const supported = isPushSupported();
  const standalone = isStandalone();
  const ios = isIos();
  const permission = permissionState();
  const subscriptions = status.data?.subscriptions ?? [];
  const enabled = supported && configured && subscriptions.length > 0;

  const setEnabled = useCallback(
    (next: boolean) => {
      if (next) subscribe.mutate();
      else unsubscribe.mutate();
    },
    [subscribe, unsubscribe],
  );

  return {
    configured,
    supported,
    standalone,
    ios,
    pushRequiresIosUpgrade: capabilities.pushRequiresIosUpgrade,
    pushRequiresInstall: capabilities.pushRequiresInstall,
    serviceWorkerFailed,
    permission,
    enabled,
    subscriptionCount: subscriptions.length,
    subscriptions,
    busy: subscribe.isPending || unsubscribe.isPending,
    error: subscribe.error ?? unsubscribe.error ?? null,
    setEnabled,
    refresh: () => void status.refetch(),
  };
}

export type WebPushState = ReturnType<typeof useWebPush>;
export type { PushStatus };
