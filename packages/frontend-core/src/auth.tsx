import type { components } from '@care/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { clearPersistentUserState, clearSessionBoundQueries, sessionQueryKey } from './cache.js';
import { FrontendError } from './errors.js';
import { createCareTransport, type CareTransport } from './transport.js';

export type Session =
  components['schemas']['SessionResponse'] | components['schemas']['LoginResponse'];
export type Capability = components['schemas']['Capability'];
export type AccountKind = components['schemas']['SessionAccount']['accountKind'];
type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: FrontendError | null;
  transport: CareTransport;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  refresh: () => Promise<Session | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_CHANNEL = 'care-auth-events';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const purge = useCallback(async () => {
    clearSessionBoundQueries(queryClient);
    await clearPersistentUserState();
  }, [queryClient]);
  const transport = useMemo(
    () => createCareTransport({ onAuthInvalidated: () => void purge() }),
    [purge],
  );
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => transport.session(),
    retry: false,
  });
  const { data: sessionData, error: sessionError, isLoading, refetch } = query;
  const lastSession = useRef<string | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = () => {
      transport.resetSecurityContext();
      void purge().then(() => {
        queryClient.removeQueries({ queryKey: sessionQueryKey });
        void refetch();
      });
    };
    channelRef.current = channel;
    return () => channel.close();
  }, [purge, queryClient, refetch, transport]);

  useEffect(() => {
    const current = sessionData?.sessionId ?? null;
    if (lastSession.current && current && lastSession.current !== current) void purge();
    lastSession.current = current;
  }, [purge, sessionData?.sessionId]);

  const login = useCallback(
    async (username: string, password: string) => {
      const session = await transport.login(username, password);
      await purge();
      queryClient.setQueryData(sessionQueryKey, session);
      channelRef.current?.postMessage({ type: 'session-changed' });
      return session;
    },
    [purge, queryClient, transport],
  );

  const logout = useCallback(async () => {
    try {
      await transport.logout();
    } finally {
      transport.resetSecurityContext();
      await purge();
      queryClient.removeQueries({ queryKey: sessionQueryKey });
      channelRef.current?.postMessage({ type: 'logout' });
    }
  }, [purge, queryClient, transport]);

  const refresh = useCallback(async () => {
    const result = await refetch();
    return result.data ?? null;
  }, [refetch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: sessionData ?? null,
      loading: isLoading,
      error: sessionError instanceof FrontendError ? sessionError : null,
      transport,
      login,
      logout,
      refresh,
    }),
    [isLoading, login, logout, refresh, sessionData, sessionError, transport],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

export function hasCapability(session: Session, capability: Capability) {
  return session.capabilities.includes(capability);
}

export function admitsAccount(session: Session, app: 'voice' | 'admin') {
  return app === 'admin'
    ? session.account.accountKind === 'CARE_ADMIN'
    : session.account.accountKind !== 'CARE_ADMIN';
}

export function SessionGate({
  children,
  loading,
  unauthenticated,
  passwordChange,
  wrongApp,
  app,
}: {
  children: ReactNode;
  loading: ReactNode;
  unauthenticated: ReactNode;
  passwordChange: ReactNode;
  wrongApp: ReactNode;
  app: 'voice' | 'admin';
}) {
  const { session, loading: pending } = useAuth();
  if (pending) return loading;
  if (!session) return unauthenticated;
  if (!admitsAccount(session, app)) return wrongApp;
  if (session.passwordChangeRequired) return passwordChange;
  return children;
}

export function CapabilityGate({
  capability,
  children,
  fallback,
}: {
  capability: Capability;
  children: ReactNode;
  fallback: ReactNode;
}) {
  const { session } = useAuth();
  return session && hasCapability(session, capability) ? children : fallback;
}
