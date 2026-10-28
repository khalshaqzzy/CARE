import { useAuth } from '@care/frontend-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browserSubscriptionPayload,
  endpointHashPrefix,
  ensureBrowserSubscription,
  getInstallationId,
  isIos,
  isPushOptedOut,
  isPushSupported,
  isStandalone,
  permissionState,
  pushPlatform,
  pushProviderHost,
  setPushOptedOut,
  subscriptionPayload,
  urlBase64ToUint8Array,
} from '../../lib/push';
import {
  PushSetupFailure,
  describePushSetupFailure,
  type PushSetupGuidance,
} from '../../lib/push-errors';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { getBrowserCapabilities } from '../../lib/browser-capabilities';
import { SERVICE_WORKER_FAILURE_MARKER } from '../../register-sw';

type PushStatus = Awaited<ReturnType<ReturnType<typeof useApi>['pushStatus']>>;

/** Sessions that already made their one automatic enrollment attempt this page load. */
const autoEnrollAttempted = new Set<string>();
/** Rotated endpoints already re-registered, shared by every hook instance. */
const repairedEndpoints = new Set<string>();

/**
 * Drives the workforce Web Push state machine while keeping the in-app
 * Notification Center authoritative. Push is on by default: with
 * `autoEnable`, an installation that is not registered and was not switched
 * off on this device enrolls itself once per session, silently when
 * permission is already granted, otherwise from the user's next tap anywhere
 * in the app (the browser prompt needs that tap's user activation).
 * Subscribe/upsert and unsubscribe are idempotent by nature (backend upsert /
 * updateMany), so they need no Idempotency-Key.
 *
 * Android/Chrome specifics this flow must respect:
 * - the notification prompt is only shown while the triggering tap still holds
 *   transient user activation, so permission is requested before any await;
 * - an existing subscription must be reused (or deliberately replaced when it
 *   is bound to a rotated VAPID key) instead of blindly calling `subscribe()`,
 *   which rejects with `InvalidStateError`/`AbortError`;
 * - a rotated push subscription must be re-registered, otherwise the device
 *   keeps showing as active while every delivery fails.
 */
export function useWebPush(options: { autoEnable?: boolean } = {}) {
  const api = useApi();
  const sessionId = useSessionId();
  const accountId = useAuth().session?.account.id ?? 'anon';
  const queryClient = useQueryClient();
  const capabilities = getBrowserCapabilities();
  const platform = pushPlatform();
  const [serviceWorkerFailed, setServiceWorkerFailed] = useState(() => {
    try {
      return window.sessionStorage.getItem(SERVICE_WORKER_FAILURE_MARKER) === 'true';
    } catch {
      return false;
    }
  });
  const [lastFailure, setLastFailure] = useState<PushSetupGuidance | null>(null);
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);
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
      if (!key) throw new PushSetupFailure('unconfigured', 'Notifikasi push belum dikonfigurasi.');
      if (
        !('serviceWorker' in navigator) ||
        typeof window.Notification?.requestPermission !== 'function'
      )
        throw new PushSetupFailure('unsupported', 'Browser tidak mendukung Web Push.');
      // Ask for permission before any await: Chrome only presents the prompt
      // while the tap still holds transient user activation, and a cold
      // `serviceWorker.ready` can consume that window on Android.
      const permission = await window.Notification.requestPermission();
      if (permission === 'denied')
        throw new PushSetupFailure('permission-denied', 'Izin notifikasi diblokir.');
      if (permission !== 'granted')
        throw new PushSetupFailure('permission-dismissed', 'Izin notifikasi belum diberikan.');
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(key);
      const browserSubscription = await ensureBrowserSubscription(
        registration.pushManager,
        applicationServerKey,
      );
      return api.subscribePush(
        subscriptionPayload(browserSubscription.endpoint, browserSubscription.keys),
      );
    },
    onMutate: () => setLastFailure(null),
    onSuccess: () => {
      setLastFailure(null);
      invalidate();
    },
    onError: (error: unknown) => {
      // Failures are surfaced as persistent guidance, not a silent queue; the
      // status refetch re-reads the browser permission so the card reflects the
      // real state after a denied or dismissed prompt.
      setLastFailure(describePushSetupFailure(error, platform));
      invalidate();
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
    onSuccess: () => {
      setBrowserEndpoint(null);
      invalidate();
    },
  });

  const configured = Boolean(publicKey.data?.configured);
  const supported = isPushSupported();
  const standalone = isStandalone();
  const ios = isIos();
  const permission = permissionState();
  const subscriptions = status.data?.subscriptions ?? [];
  const enabled = supported && configured && subscriptions.length > 0;
  const sessionRef = useRef({ api, invalidate });
  useEffect(() => {
    sessionRef.current = { api, invalidate };
  });

  // Re-register a rotated push subscription. Chrome/FCM (and WebAPK installs)
  // can replace the browser endpoint without the server noticing, which leaves
  // the device listed as active while every push fails. Only runs for an
  // installation that is already registered and has granted permission.
  useEffect(() => {
    if (!canUsePushApi || permission !== 'granted' || !status.data) return;
    const installationId = getInstallationId();
    const mine = status.data.subscriptions.find(
      (subscription) => subscription.installationId === installationId,
    );
    const storedPrefix = mine?.endpointHashPrefix;
    if (!mine || !storedPrefix) return;
    let cancelled = false;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const current = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setBrowserEndpoint(current?.endpoint ?? null);
        if (!current) return;
        const prefix = await endpointHashPrefix(current.endpoint);
        if (cancelled || !prefix || prefix === storedPrefix) return;
        if (repairedEndpoints.has(current.endpoint)) return;
        repairedEndpoints.add(current.endpoint);
        await sessionRef.current.api.subscribePush(browserSubscriptionPayload(current));
        sessionRef.current.invalidate();
      } catch {
        // Drift repair is best-effort; the settings card still offers a manual retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUsePushApi, permission, status.data, sessionId]);

  const installationRegistered = subscriptions.some(
    (subscription) => subscription.installationId === getInstallationId(),
  );
  const subscribeRef = useRef(subscribe.mutate);
  useEffect(() => {
    subscribeRef.current = subscribe.mutate;
  });

  // Default-on enrollment. Runs at most once per session so a dismissed or
  // failed prompt is not repeated on every tap; a later login (which revokes
  // the server subscription) enrolls again.
  const autoEnable = Boolean(options.autoEnable);
  useEffect(() => {
    if (!autoEnable || !canUsePushApi || !configured || !status.data) return;
    if (installationRegistered || permission === 'denied' || permission === 'unsupported') return;
    if (autoEnrollAttempted.has(sessionId) || isPushOptedOut(accountId)) return;
    const enroll = () => {
      autoEnrollAttempted.add(sessionId);
      subscribeRef.current();
    };
    if (permission === 'granted') {
      enroll();
      return;
    }
    const onTap = (event: MouseEvent) => {
      // The settings card drives its own explicit opt-in.
      if (event.target instanceof Element && event.target.closest('.push-settings')) return;
      window.removeEventListener('click', onTap, true);
      enroll();
    };
    window.addEventListener('click', onTap, true);
    return () => window.removeEventListener('click', onTap, true);
  }, [
    autoEnable,
    canUsePushApi,
    configured,
    status.data,
    installationRegistered,
    permission,
    sessionId,
    accountId,
  ]);

  const setEnabled = useCallback(
    (next: boolean) => {
      // Only an explicit switch-off is remembered; switching on clears it.
      setPushOptedOut(accountId, !next);
      if (next) subscribe.mutate();
      else unsubscribe.mutate();
    },
    [accountId, subscribe, unsubscribe],
  );

  return {
    configured,
    supported,
    standalone,
    ios,
    platform,
    pushRequiresIosUpgrade: capabilities.pushRequiresIosUpgrade,
    pushRequiresInstall: capabilities.pushRequiresInstall,
    serviceWorkerFailed,
    permission,
    enabled,
    lastFailure: lastFailure?.reason ?? null,
    failure: lastFailure,
    subscriptionCount: subscriptions.length,
    subscriptions,
    busy: subscribe.isPending || unsubscribe.isPending,
    error: subscribe.error ?? unsubscribe.error ?? null,
    diagnostics: {
      installationRegistered,
      providerHost: browserEndpoint ? pushProviderHost(browserEndpoint) : null,
      serviceWorkerSupported: capabilities.serviceWorkerSupported,
      serviceWorkerFailed,
    },
    setEnabled,
    refresh: () => void status.refetch(),
  };
}

/** Mounted once in the signed-in shell so push is enrolled by default. */
export function PushAutoEnable(): null {
  useWebPush({ autoEnable: true });
  return null;
}

export type WebPushState = ReturnType<typeof useWebPush>;
export type { PushStatus };
