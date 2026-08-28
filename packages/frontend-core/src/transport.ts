import { createCareClient, type components } from '@care/contracts';
import { normalizeApiError, offlineError } from './errors.js';

type SessionResponse = components['schemas']['SessionResponse'];
type LoginResponse = components['schemas']['LoginResponse'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_MUTATIONS = new Set(['/api/v1/auth/login']);

export type AuthInvalidationHandler = () => void;

export function createCareTransport({
  onAuthInvalidated,
}: { onAuthInvalidated?: AuthInvalidationHandler } = {}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://care.localhost';
  const client = createCareClient(origin);
  let csrfToken: string | null = null;
  let csrfRequest: Promise<string> | null = null;

  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    csrfRequest ??= client
      .GET('/api/v1/auth/csrf')
      .then(({ data, error, response }) => {
        if (!data) throw normalizeApiError(error, response.status);
        csrfToken = data.token;
        return data.token;
      })
      .finally(() => {
        csrfRequest = null;
      });
    return csrfRequest;
  }

  client.use({
    async onRequest({ request }) {
      if (
        !SAFE_METHODS.has(request.method) &&
        !PUBLIC_MUTATIONS.has(new URL(request.url).pathname)
      ) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) throw offlineError();
        request.headers.set('X-CSRF-Token', await getCsrfToken());
      }
      return request;
    },
    onResponse({ response }) {
      if (response.status === 401) {
        csrfToken = null;
        onAuthInvalidated?.();
      }
      return response;
    },
  });

  return {
    client,
    resetSecurityContext() {
      csrfToken = null;
      csrfRequest = null;
    },
    async session(): Promise<SessionResponse> {
      const { data, error, response } = await client.GET('/api/v1/auth/session');
      if (!data) throw normalizeApiError(error, response.status);
      return data;
    },
    async login(username: string, password: string): Promise<LoginResponse> {
      const { data, error, response } = await client.POST('/api/v1/auth/login', {
        body: { username, password },
      });
      if (!data) throw normalizeApiError(error, response.status);
      csrfToken = null;
      return data;
    },
    async logout() {
      const { data, error, response } = await client.POST('/api/v1/auth/logout', {
        params: { header: { 'X-CSRF-Token': '' } },
      });
      if (!data) throw normalizeApiError(error, response.status);
      csrfToken = null;
      return data;
    },
    async changePassword(currentPassword: string, newPassword: string) {
      const { data, error, response } = await client.POST('/api/v1/auth/change-password', {
        params: { header: { 'X-CSRF-Token': '' } },
        body: { currentPassword, newPassword },
      });
      if (!data) throw normalizeApiError(error, response.status);
      return data;
    },
  };
}

export type CareTransport = ReturnType<typeof createCareTransport>;
