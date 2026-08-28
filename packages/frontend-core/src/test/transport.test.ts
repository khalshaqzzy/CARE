import { careQueryKey } from '../cache.js';
import { FrontendError, normalizeApiError } from '../errors.js';
import { createCareTransport } from '../transport.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('same-origin CARE transport', () => {
  it('uses same-origin credentials and excludes login from CSRF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ sessionId: 's1' }));
    await createCareTransport().login('member', 'secret');
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(new URL(request.url).pathname).toBe('/api/v1/auth/login');
    expect(request.credentials).toBe('include');
    expect(request.headers.has('X-CSRF-Token')).toBe(false);
  });

  it('fetches CSRF lazily and attaches it to a mutation', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ token: 'csrf-token' }))
      .mockResolvedValueOnce(json({ ok: true }));
    await createCareTransport().logout();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [csrfRequest] = fetchMock.mock.calls[0] as [Request];
    const [logoutRequest] = fetchMock.mock.calls[1] as [Request];
    expect(new URL(csrfRequest.url).pathname).toBe('/api/v1/auth/csrf');
    expect(logoutRequest.headers.get('X-CSRF-Token')).toBe('csrf-token');
  });

  it('blocks offline mutation before a network call without queueing', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(createCareTransport().logout()).rejects.toMatchObject({
      kind: 'offline',
      code: 'OFFLINE_MUTATION_BLOCKED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('invalidates auth on 401 and preserves a correlation id', async () => {
    const invalidated = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(
        { code: 'UNAUTHENTICATED', message: 'Sesi berakhir', correlationId: 'corr-1', errors: [] },
        401,
      ),
    );
    await expect(
      createCareTransport({ onAuthInvalidated: invalidated }).session(),
    ).rejects.toMatchObject({ kind: 'unauthenticated', correlationId: 'corr-1' });
    expect(invalidated).toHaveBeenCalledOnce();
  });

  it('normalizes permission and conflict safely', () => {
    expect(normalizeApiError({ code: 'FORBIDDEN', message: 'Tidak tersedia' }, 403)).toMatchObject({
      kind: 'permission',
    });
    expect(
      normalizeApiError({ code: 'VERSION_CONFLICT', message: 'Data berubah' }, 409),
    ).toMatchObject({ kind: 'conflict' });
    expect(normalizeApiError(new FrontendError('offline', 'Offline', 'OFFLINE'))).toMatchObject({
      kind: 'offline',
    });
  });

  it('namespaces query keys by session without PII', () => {
    expect(careQueryKey('session-a', 'voices')).toEqual(['care-session', 'session-a', 'voices']);
    expect(careQueryKey('session-b', 'voices')).not.toEqual(careQueryKey('session-a', 'voices'));
  });
});
