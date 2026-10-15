import type { components } from '@care/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCareQueryClient } from '../cache.js';
import { AuthProvider, CapabilityGate, SessionGate, useAuth } from '../auth.js';

type Session = components['schemas']['SessionResponse'];
const session = (overrides: Partial<Session> = {}): Session => ({
  account: {
    id: 'account-1',
    username: '000128',
    displayName: 'Member',
    accountKind: 'WORKFORCE',
    status: 'ACTIVE',
  },
  workforceProfile: {
    structuralPosition: null,
    organizationSnapshotId: null,
    organizationUnitId: null,
  },
  employee: null,
  unionProfile: null,
  capabilities: ['MEMBER'],
  scopes: { overview: ['OWN'], detail: ['OWN'], action: ['REPORTER_OWN'] },
  sessionId: 'session-1',
  passwordChangeRequired: false,
  ...overrides,
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const errorJson = (status: number) =>
  new Response(JSON.stringify({ code: 'ERROR', message: 'Request failed' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function AuthProbe() {
  const { session: current, logout, transport } = useAuth();
  return (
    <div>
      <span>{current ? `authenticated:${current.sessionId}` : 'unauthenticated'}</span>
      <button type="button" onClick={() => void logout().catch(() => undefined)}>
        logout
      </button>
      <button type="button" onClick={() => void transport.session().catch(() => undefined)}>
        request-session
      </button>
    </div>
  );
}

function renderProbe() {
  const client = createCareQueryClient();
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe('auth bootstrap and route guards', () => {
  it('enforces forced-password before protected content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(session({ passwordChangeRequired: true })),
    );
    const client = createCareQueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SessionGate
            app="voice"
            loading="loading"
            unauthenticated="login"
            wrongApp="wrong"
            passwordChange="change-password"
          >
            <span>protected</span>
          </SessionGate>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('change-password')).toBeVisible();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('rejects the wrong app and gates missing capabilities', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(
        session({
          account: {
            id: 'admin-1',
            username: 'admin',
            displayName: 'Admin',
            accountKind: 'CARE_ADMIN',
            status: 'ACTIVE',
          },
        }),
      ),
    );
    const client = createCareQueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SessionGate
            app="voice"
            loading="loading"
            unauthenticated="login"
            wrongApp="wrong-app"
            passwordChange="password"
          >
            <CapabilityGate capability="CARE_ADMIN" fallback="permission">
              <span>allowed</span>
            </CapabilityGate>
          </SessionGate>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('wrong-app')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText('allowed')).not.toBeInTheDocument();
    });
  });

  it('clears the observed session immediately while logout is still in flight', async () => {
    let resolveLogout!: (response: Response) => void;
    const pendingLogout = new Promise<Response>((resolve) => {
      resolveLogout = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url.endsWith('/api/v1/auth/session')) return json(session());
      if (request.url.endsWith('/api/v1/auth/csrf')) return json({ token: 'csrf-token' });
      return pendingLogout;
    });
    renderProbe();
    expect(await screen.findByText('authenticated:session-1')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('unauthenticated')).toBeVisible();
    resolveLogout(json({ success: true }));
  });

  it('keeps local state unauthenticated when the logout request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url.endsWith('/api/v1/auth/session')) return json(session());
      if (request.url.endsWith('/api/v1/auth/csrf')) return json({ token: 'csrf-token' });
      return errorJson(500);
    });
    renderProbe();
    expect(await screen.findByText('authenticated:session-1')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('unauthenticated')).toBeVisible();
  });

  it('clears local auth when any transport request receives a 401', async () => {
    let sessionRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url.endsWith('/api/v1/auth/session')) {
        sessionRequests += 1;
        return sessionRequests === 1 ? json(session()) : errorJson(401);
      }
      return errorJson(500);
    });
    renderProbe();
    expect(await screen.findByText('authenticated:session-1')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'request-session' }));
    expect(await screen.findByText('unauthenticated')).toBeVisible();
  });

  it('ignores a stale bootstrap response after logout has cancelled the session query', async () => {
    let resolveBootstrap!: (response: Response) => void;
    const bootstrap = new Promise<Response>((resolve) => {
      resolveBootstrap = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url.endsWith('/api/v1/auth/session')) return bootstrap;
      if (request.url.endsWith('/api/v1/auth/csrf')) return json({ token: 'csrf-token' });
      return json({ success: true });
    });
    renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('unauthenticated')).toBeVisible();
    await act(async () => resolveBootstrap(json(session())));
    await waitFor(() => {
      expect(screen.getByText('unauthenticated')).toBeVisible();
    });
    expect(screen.queryByText('authenticated:session-1')).not.toBeInTheDocument();
  });

  it('applies a cross-tab logout without refetching the session', async () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    class TestBroadcastChannel {
      get onmessage() {
        return messageHandler;
      }
      set onmessage(handler: ((event: MessageEvent) => void) | null) {
        messageHandler = handler;
      }
      constructor(name: string) {
        void name;
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(session()));
    renderProbe();
    expect(await screen.findByText('authenticated:session-1')).toBeVisible();
    await act(async () => {
      messageHandler?.({ data: { type: 'logout' } } as MessageEvent);
    });
    expect(await screen.findByText('unauthenticated')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
