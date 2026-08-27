import type { Page } from '@playwright/test';
import type { components } from '@care/contracts';

type Session = components['schemas']['SessionResponse'];

const errorBody = (code: string) =>
  JSON.stringify({
    code,
    message: 'Not found in mock',
    errors: [],
    correlationId: 'e2e-correlation',
  });

/** Build a workforce SessionResponse for the given capabilities. */
export function memberSession(
  overrides: Partial<{
    accountId: string;
    displayName: string;
    capabilities: string[];
    directorate: string;
    division: string;
    department: string;
    section: string;
    structuralPosition: string | null;
  }> = {},
): Session {
  const capabilities = overrides.capabilities ?? ['MEMBER'];
  return {
    account: {
      id: overrides.accountId ?? 'member-1',
      username: '000128',
      displayName: overrides.displayName ?? 'Budi Santoso',
      accountKind: 'WORKFORCE',
      status: 'ACTIVE',
    },
    workforceProfile: {
      structuralPosition: overrides.structuralPosition ?? null,
      organizationSnapshotId: null,
      organizationUnitId: null,
    },
    employee: {
      noReg: '000128',
      name: overrides.displayName ?? 'Budi Santoso',
      directorate: overrides.directorate ?? null,
      division: overrides.division ?? null,
      department: overrides.department ?? null,
      section: overrides.section ?? null,
      structuralPosition: overrides.structuralPosition ?? null,
    },
    unionProfile: null,
    capabilities,
    scopes: { overview: ['OWN'], detail: ['OWN'], action: ['REPORTER_OWN'] },
    sessionId: 'session-workforce',
    passwordChangeRequired: false,
  };
}

/** Build a CARE Admin SessionResponse. */
export function adminSession(): Session {
  return {
    account: {
      id: 'admin-1',
      username: 'care-admin',
      displayName: 'CARE Admin',
      accountKind: 'CARE_ADMIN',
      status: 'ACTIVE',
    },
    workforceProfile: null,
    employee: null,
    unionProfile: null,
    capabilities: ['CARE_ADMIN'],
    scopes: {
      overview: ['ADMIN_OPERATIONAL'],
      detail: ['GENERAL_ALL', 'PRIVATE_ALL_READ_ONLY'],
      action: [],
    },
    sessionId: 'session-admin',
    passwordChangeRequired: false,
  };
}

/**
 * Install the Admin Voice Explorer mocks (≥1280px app): session, the voices
 * list/detail, and the paginated timeline/messages. Runs on the Admin origin
 * (`http://127.0.0.1:4174`).
 */
export async function mockAdminApi(page: Page, voice: MockVoice) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const fulfill = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'GET' && path === '/api/v1/auth/session') return fulfill(200, adminSession());
    if (method === 'GET' && path === '/api/v1/voices')
      return fulfill(200, { items: [voice], nextCursor: null });
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}`)
      return fulfill(200, detail(voice));
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}/timeline`)
      return fulfill(200, {
        items: [
          { id: 'evt-1', type: 'SUBMITTED', occurredAt: '2026-08-01T00:00:00.000Z', payload: {} },
        ],
        nextCursor: null,
      });
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}/messages`)
      return fulfill(200, {
        items: [
          {
            id: 'msg-1',
            text: 'Hello',
            createdAt: '2026-08-02T01:00:00.000Z',
            senderId: 'handler-1',
            senderAccountKind: 'WORKFORCE',
            sender: { kind: 'WORKFORCE' },
            attachments: [],
          },
        ],
        nextCursor: null,
      });
    return fulfill(404, errorBody('NOT_FOUND'));
  });
}

export type MockVoice = {
  id: string;
  displayId: string;
  audience: string;
  visibility: 'GENERAL' | 'PRIVATE';
  status: string;
  area: string;
  title: string;
  detail: string;
  availableActions: string[];
};

/**
 * Install a deterministic mock for a workforce session + the endpoints the
 * Member/responder detail pages call. Unmatched `/api/v1` requests return a
 * generic 404 envelope so the UI degrades visibly instead of hitting a
 * non-running API.
 */
export async function mockApi(page: Page, voice: MockVoice) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const fulfill = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });

    if (method === 'GET' && path === '/api/v1/auth/session') return fulfill(200, memberSession());
    if (method === 'GET' && path === '/api/v1/notifications/unread-count')
      return fulfill(200, { count: 0 });

    if (method === 'GET' && path === '/api/v1/dashboard/member')
      return fulfill(200, {
        total: 1,
        counts: { OPEN: 0, IN_VERIFICATION: 0, IN_PROGRESS: 1, CLOSED: 0 },
        recent: [voice],
        draft: null,
        generatedAt: new Date().toISOString(),
      });
    if (method === 'GET' && path === '/api/v1/voices')
      return fulfill(200, { items: [voice], nextCursor: null });
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}`)
      return fulfill(200, detail(voice));
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}/timeline`)
      return fulfill(200, {
        items: [
          { id: 'evt-1', type: 'SUBMITTED', occurredAt: '2026-08-01T00:00:00.000Z', payload: {} },
          { id: 'evt-2', type: 'PROCEEDED', occurredAt: '2026-08-02T00:00:00.000Z', payload: {} },
          {
            id: 'evt-3',
            type: 'MESSAGE_SENT',
            occurredAt: '2026-08-03T00:00:00.000Z',
            payload: {},
          },
        ],
        nextCursor: null,
      });
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}/messages`)
      return fulfill(200, {
        items: [
          {
            id: 'msg-1',
            text: 'Mohon konfirmasi lokasi kejadian.',
            createdAt: '2026-08-02T01:00:00.000Z',
            senderId: 'handler-1',
            senderAccountKind: 'WORKFORCE',
            sender: { kind: 'WORKFORCE' },
            attachments: [],
          },
        ],
        nextCursor: 'msg-next',
      });
    if (method === 'GET' && path === `/api/v1/voices/${voice.id}/assignment-candidates`)
      return fulfill(200, []);

    return fulfill(404, errorBody('NOT_FOUND'));
  });
}

function detail(voice: MockVoice) {
  return {
    id: voice.id,
    displayId: voice.displayId,
    audience: voice.audience,
    visibility: voice.visibility,
    area: voice.area,
    locationDetail: 'Lantai 3, dekat mesin produksi',
    title: voice.title,
    detail: voice.detail,
    category: 'SAFETY',
    severity: 'HIGH',
    status: voice.status,
    version: 3,
    submittedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    classificationSource: 'AI',
    routeOwner: { id: 'handler-1', displayName: 'Manager PIC' },
    currentHandler: { id: 'handler-1', displayName: 'Manager PIC' },
    attachments: [],
    locationReview: {
      id: 'lr-1',
      completeness: 'COMPLETE',
      warning: null,
      questions: [],
      contentHash: 'a'.repeat(64),
    },
    closureCycles: [],
    availableActions: voice.availableActions,
    reporter: {
      noReg: '000128',
      name: 'Budi Santoso',
      directorate: 'Manufacturing',
      division: 'Division A',
      department: 'Department A',
      section: 'Section A',
      position: 'Member',
    },
  };
}
