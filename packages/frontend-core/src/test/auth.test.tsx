import type { components } from '@care/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createCareQueryClient } from '../cache.js';
import { AuthProvider, CapabilityGate, SessionGate } from '../auth.js';

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
});
