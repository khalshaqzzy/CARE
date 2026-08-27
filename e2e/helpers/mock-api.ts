import type { Page } from '@playwright/test';
import type { components } from '@care/contracts';

type Session = components['schemas']['SessionResponse'];
type Health = components['schemas']['Health'];
type Readiness = components['schemas']['Readiness'];
type Release = components['schemas']['Release'];
type AccountSummary = components['schemas']['AccountSummary'];
type AccountSummaryList = components['schemas']['AccountSummaryList'];
type OrganizationImportPreview = components['schemas']['OrganizationImportPreview'];
type OrganizationImportList = components['schemas']['OrganizationImportList'];
type OrganizationChangeList = components['schemas']['OrganizationChangeList'];
type OrganizationSnapshot = components['schemas']['OrganizationSnapshot'];
type RemediationIssueList = components['schemas']['RemediationIssueList'];
type RemediationResolutionList = components['schemas']['RemediationResolutionList'];
type SectionHeadCandidateList = components['schemas']['SectionHeadCandidateList'];
type UnionAccountList = components['schemas']['UnionAccountList'];
type AuditEventList = components['schemas']['AuditEventList'];
type AuditEvent = components['schemas']['AuditEvent'];
type VoiceListResponse = components['schemas']['VoiceListResponse'];
type VoiceListItem = components['schemas']['VoiceListItem'];
type VoiceDetail = components['schemas']['AdminPrivateVoiceDetail'];
type TimelinePage = components['schemas']['TimelinePage'];
type MessagePage = components['schemas']['MessagePage'];
type AdminOverview = components['schemas']['AdminOverview'];

/** A safe, non-leaking error envelope for the mock. */
export function errorBody(code: string, message = 'Not found in mock') {
  return JSON.stringify({
    code,
    message,
    errors: [],
    correlationId: 'e2e-correlation',
  });
}

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
export function adminSession(
  overrides: Partial<{
    id: string;
    username: string;
    displayName: string;
    passwordChangeRequired: boolean;
    status: 'ACTIVE' | 'LEGACY_HANDLER' | 'INACTIVE';
  }> = {},
): Session {
  return {
    account: {
      id: overrides.id ?? 'admin-1',
      username: overrides.username ?? 'care-admin',
      displayName: overrides.displayName ?? 'CARE Admin',
      accountKind: 'CARE_ADMIN',
      status: overrides.status ?? 'ACTIVE',
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
    passwordChangeRequired: overrides.passwordChangeRequired ?? false,
  };
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

const voiceDetail = (voice: MockVoice): VoiceDetail => ({
  id: voice.id,
  displayId: voice.displayId,
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
  visibility: voice.visibility,
  area: voice.area as VoiceDetail['area'],
  locationDetail: 'Lantai 3, dekat mesin produksi',
  title: voice.title,
  detail: voice.detail,
  category: 'SAFETY',
  severity: 'HIGH',
  status: voice.status as VoiceDetail['status'],
  version: 3,
  submittedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
  classificationSource: 'AI',
  availableActions: voice.availableActions,
  closureCycles: [],
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
  reporter: {
    noReg: '000128',
    name: 'Budi Santoso',
    directorate: 'Manufacturing',
    division: 'Division A',
    department: 'Department A',
    section: 'Section A',
    position: 'Member',
  },
});

const baseVoiceItem = (voice: MockVoice): VoiceListItem => ({
  id: voice.id,
  displayId: voice.displayId,
  visibility: voice.visibility,
  area: voice.area as VoiceListItem['area'],
  title: voice.title,
  category: 'SAFETY',
  severity: 'HIGH',
  status: voice.status as VoiceListItem['status'],
  updatedAt: '2026-08-03T00:00:00.000Z',
});

const healthFixture = (): Health => ({ status: 'ok' });

const readyFixture = (): Readiness => ({
  status: 'ready',
  checks: { database: 'ok', migrations: 'ok', outbox: 'ok', storage: 'ok' },
  dependencies: { openai: 'degraded', push: 'configured' },
  config: {
    environment: 'test',
    releaseSha: 'ci',
    mediaRoot: './.tmp',
    openai: { configured: false, model: null },
    push: { configured: false },
  },
});

const releaseFixture = (): Release => ({ releaseSha: 'ci', version: '1.0.0', service: 'care-api' });

const overviewFixture = (): AdminOverview => ({
  accounts: { active: 3, legacy: 1, inactive: 2 },
  openRemediation: 2,
  latestImport: { id: 'batch-1', status: 'CONFIRMED', createdAt: '2026-08-01T00:00:00.000Z' },
  unionSlots: 3,
  recentResolution: {
    id: 'res-1',
    action: 'set_default_pic',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
});

const accountFixtures = (): AccountSummary[] => [
  {
    id: 'account-1',
    username: '000128',
    displayName: 'Budi Santoso',
    accountKind: 'WORKFORCE',
    status: 'ACTIVE',
    version: 1,
    passwordChangeRequired: true,
    employee: {
      noReg: '000128',
      name: 'Budi Santoso',
      active: true,
      memberships: [
        {
          structuralPosition: 'Member',
          section: 'Section A',
          organizationUnit: {
            id: 'unit-1',
            directorate: 'Manufacturing',
            division: 'Division A',
            department: 'Department A',
          },
        },
      ],
    },
  },
  {
    id: 'account-admin',
    username: 'care-admin',
    displayName: 'CARE Admin',
    accountKind: 'CARE_ADMIN',
    status: 'ACTIVE',
    version: 1,
  },
];

const importPreviewFixture = (): OrganizationImportPreview => ({
  id: 'batch-1',
  checksum: 'a'.repeat(64),
  version: 1,
  expiresAt: '2026-09-01T00:00:00.000Z',
  status: 'PREVIEWED',
  summary: {
    rowCount: 4,
    unitCount: 1,
    create: 2,
    update: 1,
    deactivate: 1,
    unchanged: 0,
    routeGaps: [{ organizationUnit: 'Unit A', missing: 'Department Head' }],
    department14Rows: 1,
    globalPicInvalid: false,
    unionGaps: [],
  },
  errors: [],
  createdAt: '2026-08-01T00:00:00.000Z',
});

const importListFixture = (): OrganizationImportList => ({
  items: [importPreviewFixture()],
  nextCursor: null,
});

const changeListFixture = (): OrganizationChangeList => ({
  id: 'batch-1',
  total: 3,
  items: [
    { noReg: '000128', type: 'CREATE' },
    { noReg: '000129', type: 'UPDATE', positionChanged: true },
    { noReg: '000130', type: 'DEACTIVATE' },
  ],
  nextCursor: null,
});

const snapshotFixture = (): OrganizationSnapshot => ({
  id: 'snap-1',
  checksum: 'b'.repeat(64),
  effectiveAt: '2026-08-01T00:00:00.000Z',
  rowCount: 4,
  status: 'ACTIVE',
  unitCount: 1,
  memberCount: 4,
  headCount: 1,
});

const remediationFixture = (): RemediationIssueList => ({
  items: [
    {
      id: 'issue-1',
      type: 'MISSING_DEPARTMENT_HEAD',
      status: 'OPEN',
      organizationUnitId: 'unit-1',
      details: { currentRouteId: null },
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'issue-2',
      type: 'UNION_HEAD_MISSING',
      status: 'OPEN',
      details: {},
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
});

const remediationHistoryFixture = (): RemediationResolutionList => ({
  items: [
    {
      id: 'res-1',
      action: 'set_default_pic',
      reason: 'remediation',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
});

const sectionHeadFixture = (): SectionHeadCandidateList => [
  {
    employeeName: 'Budi Santoso',
    section: 'Section A',
    structuralPosition: 'Section Head',
    employee: { noReg: '000128', account: { id: 'account-1', username: '000128' } },
  },
];

const unionFixture = (): UnionAccountList => [
  {
    id: 'union-head-1',
    slot: 'HEAD',
    effectiveFrom: '2026-08-01T00:00:00.000Z',
    account: {
      id: 'union-head',
      username: 'union-head',
      displayName: 'Union Head',
      accountKind: 'UNION',
      status: 'ACTIVE',
      version: 1,
      unionTerms: [{ slot: 'HEAD' }],
    },
  },
  {
    id: 'union-o1-1',
    slot: 'OFFICER_1',
    account: {
      id: 'union-o1',
      username: 'union-1',
      displayName: 'Union 1',
      accountKind: 'UNION',
      status: 'ACTIVE',
      version: 1,
      unionTerms: [{ slot: 'OFFICER_1' }],
    },
  },
  {
    id: 'union-o2-1',
    slot: 'OFFICER_2',
    account: {
      id: 'union-o2',
      username: 'union-2',
      displayName: 'Union 2',
      accountKind: 'UNION',
      status: 'ACTIVE',
      version: 1,
      unionTerms: [{ slot: 'OFFICER_2' }],
    },
  },
];

const auditFixture = (): AuditEventList => ({
  items: [
    {
      id: 'audit-1',
      action: 'VOICE_PRIVATE_DETAIL_READ',
      result: 'SUCCESS',
      resourceType: 'Voice',
      resourceId: 'voice-1',
      actorAccountKind: 'CARE_ADMIN',
      actorStructuralPosition: null,
      occurredAt: '2026-08-01T00:00:00.000Z',
      correlationId: 'e2e-correlation',
      releaseSha: 'ci',
      reason: null,
      summary: { scope: 'PRIVATE_DETAIL' },
    },
    {
      id: 'audit-2',
      action: 'ACCOUNT_PASSWORD_RESET',
      result: 'SUCCESS',
      resourceType: 'UserAccount',
      resourceId: 'account-1',
      actorAccountKind: 'CARE_ADMIN',
      actorStructuralPosition: null,
      occurredAt: '2026-08-02T00:00:00.000Z',
      correlationId: 'e2e-correlation',
      releaseSha: 'ci',
      reason: 'remediation',
      summary: {},
    },
  ],
  nextCursor: null,
});

const auditDetailFixture = (): AuditEvent => ({
  id: 'audit-1',
  action: 'VOICE_PRIVATE_DETAIL_READ',
  result: 'SUCCESS',
  resourceType: 'Voice',
  resourceId: 'voice-1',
  actorAccountKind: 'CARE_ADMIN',
  actorStructuralPosition: null,
  occurredAt: '2026-08-01T00:00:00.000Z',
  correlationId: 'e2e-correlation',
  releaseSha: 'ci',
  reason: null,
  summary: { scope: 'PRIVATE_DETAIL' },
});

const timelineFixture = (): TimelinePage => ({
  items: [{ id: 'evt-1', type: 'SUBMITTED', occurredAt: '2026-08-01T00:00:00.000Z', payload: {} }],
  nextCursor: null,
});

const messagesFixture = (): MessagePage => ({
  items: [
    {
      id: 'msg-1',
      text: 'Mohon konfirmasi lokasi kejadian.',
      createdAt: '2026-08-02T01:00:00.000Z',
      senderId: 'handler-1',
      senderAccountKind: 'WORKFORCE',
      sender: { kind: 'WORKFORCE', alias: 'Handler' },
      attachments: [],
    },
  ],
  nextCursor: null,
});

/**
 * A single `/api/v1` (plus `/health`, `/ready`, `/release.json`) mock that
 * covers every endpoint the Admin pages call. Each section can be overridden
 * through `opts`; set `opts.error` to force every response into a safe error
 * envelope for state/denial tests.
 */
export async function mockAdminApi(
  page: Page,
  opts: {
    session?: Session;
    error?: { status: number; code: string };
    overview?: AdminOverview;
    accounts?: AccountSummaryList;
    accountDetail?: AccountSummary;
    imports?: OrganizationImportList;
    importDetail?: OrganizationImportPreview;
    importChanges?: OrganizationChangeList;
    snapshot?: OrganizationSnapshot;
    remediation?: RemediationIssueList;
    remediationHistory?: RemediationResolutionList;
    sectionHeads?: SectionHeadCandidateList;
    union?: UnionAccountList;
    audit?: AuditEventList;
    auditDetail?: AuditEvent;
    voices?: VoiceListResponse;
    voiceDetail?: VoiceDetail;
    timeline?: TimelinePage;
    messages?: MessagePage;
    health?: Health;
    ready?: Readiness;
    release?: Release;
  } = {},
) {
  const session = opts.session ?? adminSession();
  const override = (key: keyof typeof opts) => opts[key] as unknown;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const fulfill = (status: number, payload: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const error = (status: number, code: string) => fulfill(status, errorBody(code));

    if (method === 'GET' && path === '/api/v1/auth/session') return fulfill(200, session);

    // Error mode affects every data endpoint so the protected tree still mounts
    // (the session above is always resolved) but the page shows its error state.
    if (opts.error) {
      await route.fulfill({
        status: opts.error.status,
        contentType: 'application/json',
        body: errorBody(opts.error.code, 'Mocked state error'),
      });
      return;
    }
    if (method === 'GET' && path === '/api/v1/admin/overview')
      return fulfill(200, override('overview') ?? overviewFixture());
    if (method === 'GET' && path === '/api/v1/admin/accounts')
      return fulfill(200, override('accounts') ?? { items: accountFixtures(), nextCursor: null });
    if (method === 'GET' && path.startsWith('/api/v1/admin/accounts/')) {
      return fulfill(200, override('accountDetail') ?? accountFixtures()[0]);
    }
    if (method === 'GET' && path === '/api/v1/admin/organization-imports')
      return fulfill(200, override('imports') ?? importListFixture());
    if (method === 'GET' && path === '/api/v1/admin/organization-imports/preview')
      return error(400, 'UPLOAD_REQUIRED');
    if (method === 'POST' && path === '/api/v1/admin/organization-imports/preview')
      return fulfill(200, override('importDetail') ?? importPreviewFixture());
    if (method === 'GET' && /\/api\/v1\/admin\/organization-imports\/[^/]+\/changes$/.test(path))
      return fulfill(200, override('importChanges') ?? changeListFixture());
    if (method === 'GET' && /\/api\/v1\/admin\/organization-imports\/[^/]+$/.test(path))
      return fulfill(200, override('importDetail') ?? importPreviewFixture());
    if (method === 'POST' && /\/api\/v1\/admin\/organization-imports\/[^/]+\/confirm$/.test(path))
      return fulfill(202, { id: 'batch-1', status: 'QUEUED' });
    if (method === 'GET' && path === '/api/v1/admin/organization-snapshots/current')
      return fulfill(200, override('snapshot') ?? snapshotFixture());
    if (method === 'GET' && path === '/api/v1/admin/remediation-issues')
      return fulfill(200, override('remediation') ?? remediationFixture());
    if (method === 'GET' && path === '/api/v1/admin/remediation-issues/history')
      return fulfill(200, override('remediationHistory') ?? remediationHistoryFixture());
    if (
      method === 'GET' &&
      /\/api\/v1\/admin\/organization-units\/[^/]+\/section-head-candidates$/.test(path)
    )
      return fulfill(200, override('sectionHeads') ?? sectionHeadFixture());
    if (method === 'GET' && path === '/api/v1/admin/union-accounts')
      return fulfill(200, override('union') ?? unionFixture());
    if (method === 'GET' && path === '/api/v1/admin/audit-events')
      return fulfill(200, override('audit') ?? auditFixture());
    if (method === 'GET' && /\/api\/v1\/admin\/audit-events\/[^/]+$/.test(path))
      return fulfill(200, override('auditDetail') ?? auditDetailFixture());
    if (method === 'GET' && path === '/api/v1/voices')
      return fulfill(200, override('voices') ?? { items: [], nextCursor: null });
    if (method === 'GET' && /\/api\/v1\/voices\/[^/]+\/timeline$/.test(path))
      return fulfill(200, override('timeline') ?? timelineFixture());
    if (method === 'GET' && /\/api\/v1\/voices\/[^/]+\/messages$/.test(path))
      return fulfill(200, override('messages') ?? messagesFixture());
    if (method === 'GET' && /\/api\/v1\/voices\/[^/]+$/.test(path))
      return fulfill(200, override('voiceDetail') ?? voiceDetail(defaultVoice));
    if (method === 'POST' && /\/api\/v1\/voices\/[^/]+\/close$/.test(path))
      return fulfill(200, { success: true });
    return error(404, 'NOT_FOUND');
  });

  await page.route('**/health', (route) => {
    if (opts.error)
      return route.fulfill({
        status: opts.error.status,
        contentType: 'application/json',
        body: errorBody(opts.error.code, 'Mocked state error'),
      });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override('health') ?? healthFixture()),
    });
  });
  await page.route('**/ready', (route) => {
    if (opts.error)
      return route.fulfill({
        status: opts.error.status,
        contentType: 'application/json',
        body: errorBody(opts.error.code, 'Mocked state error'),
      });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override('ready') ?? readyFixture()),
    });
  });
  await page.route('**/release.json', (route) => {
    if (opts.error)
      return route.fulfill({
        status: opts.error.status,
        contentType: 'application/json',
        body: errorBody(opts.error.code, 'Mocked state error'),
      });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override('release') ?? releaseFixture()),
    });
  });
}

const defaultVoice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
  visibility: 'PRIVATE',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title: 'Keluhan fasilitas toilet',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  availableActions: [],
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

export { accountFixtures, auditFixture, baseVoiceItem, importPreviewFixture, voiceDetail };
