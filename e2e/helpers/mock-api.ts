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

/** Build a Union session (HEAD or OFFICER) exactly as the backend serializes it. */
export function unionSession(
  opts: {
    slot?: 'HEAD' | 'OFFICER_1' | 'OFFICER_2';
    username?: string;
    displayName?: string;
    accountId?: string;
  } = {},
): Session {
  const slot = opts.slot ?? 'HEAD';
  const isHead = slot === 'HEAD';
  return {
    account: {
      id: opts.accountId ?? (isHead ? 'union-head-1' : 'union-officer-1'),
      username: opts.username ?? (isHead ? 'union-head' : 'union-1'),
      displayName: opts.displayName ?? (isHead ? 'Union Head' : 'Union Officer 1'),
      accountKind: 'UNION',
      status: 'ACTIVE',
    },
    workforceProfile: null,
    employee: null,
    unionProfile: { slot },
    capabilities: isHead ? ['UNION_HEAD'] : ['UNION_OFFICER'],
    scopes: {
      overview: ['GENERAL_GLOBAL'],
      detail: ['GENERAL_ALL'],
      action: [isHead ? 'PRIVATE_ALL' : 'PRIVATE_ASSIGNED'],
    },
    sessionId: isHead ? 'session-union-head' : 'session-union-officer',
    passwordChangeRequired: false,
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
  conversationState?: 'UNAVAILABLE' | 'ACTIVE' | 'READ_ONLY';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category?: 'SAFETY' | 'ENVIRONMENT' | 'FACILITY' | 'WORK_DIFFICULTY' | null;
  attachments?: { id: string; mimeType: string; purpose?: string }[];
  closureCycles?: unknown[];
  updatedAt?: string;
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
  conversationState:
    voice.conversationState ??
    (voice.status === 'OPEN'
      ? 'UNAVAILABLE'
      : voice.availableActions.includes('MESSAGE')
        ? 'ACTIVE'
        : 'READ_ONLY'),
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
  category: voice.category ?? (voice.visibility === 'PRIVATE' ? null : 'SAFETY'),
  severity: voice.severity ?? 'HIGH',
  status: voice.status as VoiceListItem['status'],
  updatedAt: voice.updatedAt ?? '2026-08-03T00:00:00.000Z',
});

/**
 * A Private Voice detail shaped for a Union audience: consent SHOW carries the
 * immutable four-field reporter snapshot, consent HIDE carries only the
 * per-Voice alias. Never mixes identity fields across the two audiences.
 */
export function unionPrivateVoiceDetail(
  voice: MockVoice & { identified?: boolean; alias?: string },
): Record<string, unknown> {
  const base = {
    id: voice.id,
    displayId: voice.displayId,
    visibility: 'PRIVATE' as const,
    area: voice.area,
    locationDetail: 'Lantai 3, dekat mesin produksi',
    title: voice.title,
    detail: voice.detail,
    category: null,
    severity: voice.severity ?? ('HIGH' as const),
    status: voice.status,
    version: 3,
    submittedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    classificationSource: 'AI' as const,
    availableActions: voice.availableActions,
    conversationState:
      voice.conversationState ??
      (voice.status === 'OPEN'
        ? 'UNAVAILABLE'
        : voice.availableActions.includes('MESSAGE')
          ? 'ACTIVE'
          : 'READ_ONLY'),
    closureCycles: [],
    routeOwner: { id: 'union-head-1', displayName: 'Union Head' },
    currentHandler: null,
    attachments: [],
    locationReview: null,
  };
  if (voice.identified) {
    return {
      ...base,
      audience: 'UNION_IDENTIFIED',
      reporter: {
        noReg: '000129',
        name: 'Sari Wulandari',
        division: 'Division A',
        department: 'Department A',
      },
    };
  }
  return {
    ...base,
    audience: 'UNION_ANONYMOUS',
    anonymousReporter: { alias: voice.alias ?? 'Reporter Biru 47' },
  };
}

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
      organizationUnit: {
        id: 'unit-1',
        directorate: 'Manufacturing',
        division: 'Division A',
        department: 'Assembly',
      },
      details: { currentRouteId: null },
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'issue-2',
      type: 'UNION_HEAD_MISSING',
      status: 'OPEN',
      organizationUnit: null,
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
    importStatuses?: OrganizationImportPreview['status'][];
    importFailureCode?: string;
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
  let importStatusIndex = 0;
  let currentImportStatus = opts.importStatuses?.[0];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const fulfill = (status: number, payload: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const error = (status: number, code: string) => fulfill(status, errorBody(code));

    if (method === 'GET' && path === '/api/v1/auth/session') return fulfill(200, session);
    if (method === 'GET' && path === '/api/v1/auth/csrf')
      return fulfill(200, { token: 'csrf-admin-mock' });

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
    if (method === 'GET' && path === '/api/v1/admin/organization-imports') {
      const imports = (override('imports') ?? importListFixture()) as OrganizationImportList;
      const items: unknown[] = [];
      for (const item of imports.items as OrganizationImportPreview[])
        items.push({
          ...item,
          ...(currentImportStatus ? { status: currentImportStatus } : {}),
          ...(currentImportStatus === 'FAILED' && opts.importFailureCode
            ? { failureCode: opts.importFailureCode }
            : {}),
        });
      return fulfill(200, {
        ...imports,
        items,
      });
    }
    if (method === 'GET' && path === '/api/v1/admin/organization-imports/preview')
      return error(400, 'UPLOAD_REQUIRED');
    if (method === 'POST' && path === '/api/v1/admin/organization-imports/preview')
      return fulfill(200, override('importDetail') ?? importPreviewFixture());
    if (method === 'GET' && /\/api\/v1\/admin\/organization-imports\/[^/]+\/changes$/.test(path))
      return fulfill(200, override('importChanges') ?? changeListFixture());
    if (method === 'GET' && /\/api\/v1\/admin\/organization-imports\/[^/]+$/.test(path)) {
      const detail = (override('importDetail') ??
        importPreviewFixture()) as OrganizationImportPreview;
      if (opts.importStatuses?.length) {
        currentImportStatus =
          opts.importStatuses[Math.min(importStatusIndex, opts.importStatuses.length - 1)];
        importStatusIndex += 1;
      }
      return fulfill(200, {
        ...detail,
        ...(currentImportStatus ? { status: currentImportStatus } : {}),
        ...(currentImportStatus === 'FAILED' && opts.importFailureCode
          ? { failureCode: opts.importFailureCode }
          : {}),
      });
    }
    if (method === 'POST' && /\/api\/v1\/admin\/organization-imports\/[^/]+\/confirm$/.test(path))
      return fulfill(202, { id: 'batch-1', status: 'QUEUED' });
    if (method === 'GET' && path === '/api/v1/admin/organization-snapshots/current')
      return fulfill(200, override('snapshot') ?? snapshotFixture());
    if (method === 'GET' && path === '/api/v1/admin/remediation-issues')
      return fulfill(200, override('remediation') ?? remediationFixture());
    if (method === 'GET' && path === '/api/v1/admin/remediation-issues/history')
      return fulfill(200, override('remediationHistory') ?? remediationHistoryFixture());
    if (
      method === 'PUT' &&
      (/\/api\/v1\/admin\/organization-units\/[^/]+\/default-pic$/.test(path) ||
        path === '/api/v1/admin/routes/global-special-pic')
    )
      return fulfill(200, { id: 'route-1' });
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

export const defaultVoice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'REPORTER_SELF',
  visibility: 'PRIVATE',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title: 'Keluhan fasilitas toilet',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  availableActions: [],
};

export type MockApiOptions = {
  session?: Session;
  /** Return 401 for the session endpoint (login / unauthenticated surfaces). */
  unauthenticated?: boolean;
  voice?: MockVoice;
  /** Force every data endpoint to return a safe error envelope. */
  error?: { status: number; code: string };
  /** Override for the selected voice detail (per-audience contracts). */
  voiceDetail?: unknown;
  /** Voice list response for `/voices` and `/work-items`. */
  voiceList?: unknown;
  /** Voice list response when `/work-items` is called with `unassigned=true`. */
  unassignedVoiceList?: unknown;
  /** Override for `GET /voices/{id}/assignment-candidates`. */
  assignmentCandidates?: unknown;
  memberDashboard?: unknown;
  generalDashboard?: unknown;
  privateDashboard?: unknown;
  draft?: unknown;
  draftPreview?: unknown;
  classification?: unknown;
  locationReview?: unknown;
  notifications?: unknown;
  unread?: number;
  push?: {
    configured?: boolean;
    publicKey?: string | null;
    status?: {
      configured: boolean;
      subscriptions: {
        id: string;
        installationId: string;
        environment: string;
        lastSuccessAt?: string;
      }[];
    };
  };
};

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4dusBAAUaApFBDgH7AAAAAElFTkSuQmCC',
  'base64',
);

const defaultGENERAL_DASHBOARD = (): DashboardAggregate => ({
  total: 0,
  status: [],
  severity: [],
  category: [],
  trend: [],
  division: [],
  department: [],
  suppression: {
    enabled: false,
    threshold: 0,
    division: { suppressedBuckets: 0, suppressedValue: 0 },
    department: { suppressedBuckets: 0, suppressedValue: 0 },
  },
  filters: { area: null, category: null, severity: null, status: null, from: null, to: null },
  generatedAt: new Date().toISOString(),
});

const draftFixture = (voice?: MockVoice): unknown => ({
  id: 'draft-1',
  visibility: 'GENERAL',
  area: 'KARAWANG_1',
  locationDetail: 'Lantai 3, dekat mesin produksi',
  title: voice?.title ?? 'Pencahayaan area produksi kurang',
  detail: voice?.detail ?? 'Lampu di stasiun 3 redup.',
  showReporterIdentity: false,
  version: 1,
  classificationContentHash: 'a'.repeat(64),
  locationContentHash: 'b'.repeat(64),
  classification: {
    source: 'AI',
    category: 'SAFETY',
    severity: 'HIGH',
    confidence: 0.9,
    rationaleCode: 'CLEAR_HAZARD',
  },
  locationReview: {
    id: 'lr-1',
    completeness: 'COMPLETE',
    warning: null,
    questions: [],
    contentHash: 'c'.repeat(64),
  },
  attachments: [],
});

const previewFixture = (): unknown => ({
  ...(draftFixture() as Record<string, unknown>),
  routeReadiness: { ready: true, targetLabel: 'Department Head' },
  routeTarget: 'Department Head',
});

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
    attachments: voice.attachments ?? [],
    locationReview: {
      id: 'lr-1',
      completeness: 'COMPLETE',
      warning: null,
      questions: [],
      contentHash: 'a'.repeat(64),
    },
    closureCycles: voice.closureCycles ?? [],
    availableActions: voice.availableActions,
    conversationState:
      voice.conversationState ??
      (voice.status === 'OPEN'
        ? 'UNAVAILABLE'
        : voice.availableActions.includes('MESSAGE')
          ? 'ACTIVE'
          : 'READ_ONLY'),
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

/**
 * A four-item notification page spanning today, yesterday, and older with
 * mixed read states so grouping and unread affordances render (screen 15).
 */
const notificationPageFixture = (): unknown => ({
  items: [
    {
      id: 'note-1',
      type: 'VOICE_SUBMITTED',
      title: 'Voice baru ditugaskan',
      body: 'Sebuah Voice baru telah dirutekan kepada Anda.',
      deepLink: '/voices/voice-1',
      createdAt: '2026-08-05T00:00:00.000Z',
      readAt: null,
    },
    {
      id: 'note-2',
      type: 'STATUS_CHANGED',
      title: 'Ada pembaruan Private Voice',
      body: 'Update pada sebuah Private Voice telah tersedia.',
      deepLink: '/voices/voice-1',
      createdAt: '2026-08-04T23:30:00.000Z',
      readAt: null,
    },
    {
      id: 'note-3',
      type: 'MESSAGE',
      title: 'Voice diperbarui',
      body: 'Detail pada sebuah Voice telah diperbarui.',
      deepLink: null,
      createdAt: '2026-08-04T08:45:00.000Z',
      readAt: '2026-08-04T09:00:00.000Z',
    },
    {
      id: 'note-4',
      type: 'CLOSED',
      title: 'Verifikasi selesai',
      body: 'Verifikasi pada sebuah Voice telah selesai.',
      deepLink: null,
      createdAt: '2026-08-03T02:10:00.000Z',
      readAt: '2026-08-03T03:00:00.000Z',
    },
  ],
  nextCursor: null,
});

/**
 * Install a deterministic workforce API mock. By default it uses a Member
 * session and, when a `voice` is supplied, seeds the dashboard/list/detail
 * endpoints with that voice. `error` mode forces every data endpoint into a
 * safe error envelope so the protected tree still mounts but each page shows
 * its error state.
 */
export async function mockWorkforceApi(page: Page, opts: MockApiOptions = {}) {
  const session = opts.session ?? memberSession();
  const voice = opts.voice;

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const satisfy = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'GET' && path === '/api/v1/auth/session') {
      if (opts.unauthenticated)
        return satisfy(401, errorBody('UNAUTHENTICATED', 'Sesi tidak tersedia.'));
      return satisfy(200, session);
    }
    if (method === 'GET' && path === '/api/v1/auth/csrf')
      return satisfy(200, { token: 'csrf-token' });
    if (opts.error)
      return satisfy(opts.error.status, errorBody(opts.error.code, 'Mocked state error'));

    // Dashboards
    if (method === 'GET' && path === '/api/v1/dashboard/member') {
      return satisfy(
        200,
        opts.memberDashboard ?? {
          total: voice ? 1 : 0,
          counts: {
            OPEN: 0,
            IN_VERIFICATION: 0,
            IN_PROGRESS: voice?.status === 'IN_PROGRESS' ? 1 : 0,
            CLOSED: 0,
          },
          recent: voice ? [baseVoiceItem(voice)] : [],
          draft: null,
          generatedAt: new Date().toISOString(),
        },
      );
    }
    if (method === 'GET' && path === '/api/v1/dashboard/general')
      return satisfy(200, opts.generalDashboard ?? defaultGENERAL_DASHBOARD());
    if (method === 'GET' && path === '/api/v1/dashboard/private')
      return satisfy(200, opts.privateDashboard ?? defaultGENERAL_DASHBOARD());

    // Voice lists / work items
    if (method === 'GET' && path === '/api/v1/voices') {
      return satisfy(
        200,
        opts.voiceList ?? { items: voice ? [baseVoiceItem(voice)] : [], nextCursor: null },
      );
    }
    if (method === 'GET' && path === '/api/v1/work-items') {
      if (url.searchParams.get('unassigned') === 'true') {
        return satisfy(
          200,
          opts.unassignedVoiceList ?? {
            items: voice ? [baseVoiceItem(voice)] : [],
            nextCursor: null,
          },
        );
      }
      return satisfy(
        200,
        opts.voiceList ?? { items: voice ? [baseVoiceItem(voice)] : [], nextCursor: null },
      );
    }
    if (method === 'GET' && path === '/api/v1/voices/monitoring-options') {
      return satisfy(200, {
        handlers: [{ id: 'handler-1', displayName: 'Manager PIC' }],
        generatedAt: new Date().toISOString(),
      });
    }

    const messagesMatch = path.match(/^\/api\/v1\/voices\/([^/]+)\/messages$/);
    if (method === 'GET' && messagesMatch) {
      return satisfy(200, {
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
          {
            id: 'msg-2',
            text: 'Lantai 3, dekat mesin produksi.',
            createdAt: '2026-08-02T01:05:00.000Z',
            senderId: 'member-1',
            senderAccountKind: 'WORKFORCE',
            sender: { kind: 'WORKFORCE' },
            attachments: [],
          },
        ],
        nextCursor: 'msg-next',
      });
    }
    const timelineMatch = path.match(/^\/api\/v1\/voices\/([^/]+)\/timeline$/);
    if (method === 'GET' && timelineMatch) {
      return satisfy(200, {
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
    }
    const candidatesMatch = path.match(/^\/api\/v1\/voices\/([^/]+)\/assignment-candidates$/);
    if (method === 'GET' && candidatesMatch) {
      return satisfy(
        200,
        opts.assignmentCandidates ??
          (session.capabilities.includes('UNION_HEAD')
            ? [
                {
                  id: 'union-officer-1',
                  displayName: 'Union Officer 1',
                  slot: 'OFFICER_1',
                },
                {
                  id: 'union-officer-2',
                  displayName: 'Union Officer 2',
                  slot: 'OFFICER_2',
                },
              ]
            : []),
      );
    }
    const voiceDetailMatch = path.match(/^\/api\/v1\/voices\/([^/]+)$/);
    if (method === 'GET' && voiceDetailMatch) {
      return satisfy(200, opts.voiceDetail ?? (voice ? detail(voice) : {}));
    }
    // Lifecycle mutations
    if (
      method === 'POST' &&
      /\/api\/v1\/voices\/[^/]+\/(?:assignments|assignments\/reassign|ask|proceed|close|rate)$/.test(
        path,
      )
    ) {
      return satisfy(200, {
        id: voice?.id ?? 'voice-1',
        displayId: voice?.displayId ?? 'CARE-202608-000001',
        status: 'IN_PROGRESS',
        version: 4,
      });
    }
    if (method === 'POST' && /\/api\/v1\/voices\/[^/]+\/closure-evidence$/.test(path)) {
      return satisfy(200, {
        id: 'att-evidence',
        purpose: 'CLOSURE_EVIDENCE',
        mimeType: 'image/png',
        size: 68,
        state: 'READY',
        createdAt: new Date().toISOString(),
      });
    }

    // Drafts
    if (method === 'GET' && path === '/api/v1/drafts')
      return satisfy(200, { items: [draftFixture(voice)], nextCursor: null });
    if (method === 'POST' && path === '/api/v1/drafts') return satisfy(201, draftFixture(voice));
    const draftPreviewMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)\/preview$/);
    if (method === 'GET' && draftPreviewMatch)
      return satisfy(200, opts.draftPreview ?? previewFixture());
    const draftClassifyMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)\/classify$/);
    if (method === 'POST' && draftClassifyMatch)
      return satisfy(
        200,
        opts.classification ?? {
          source: 'AI',
          category: 'SAFETY',
          severity: 'HIGH',
          confidence: 0.9,
          rationaleCode: 'CLEAR_HAZARD',
        },
      );
    const draftManualMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)\/manual-classification$/);
    if (method === 'POST' && draftManualMatch)
      return satisfy(200, {
        source: 'MANUAL_FALLBACK',
        category: 'SAFETY',
        severity: 'MEDIUM',
        confidence: 1,
        rationaleCode: 'MANUAL',
      });
    const draftLocationMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)\/location-review$/);
    if (method === 'GET' && draftLocationMatch) return satisfy(200, opts.locationReview ?? null);
    if (method === 'POST' && draftLocationMatch)
      return satisfy(
        200,
        opts.locationReview ?? {
          id: 'lr-1',
          completeness: 'COMPLETE',
          warning: null,
          questions: [],
          contentHash: 'c'.repeat(64),
        },
      );
    const draftAttachmentsMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)\/attachments$/);
    if (method === 'POST' && draftAttachmentsMatch) {
      return satisfy(200, {
        id: 'att-draft',
        purpose: 'VOICE',
        mimeType: 'image/png',
        size: 68,
        state: 'READY',
        createdAt: new Date().toISOString(),
      });
    }
    const draftAttachmentRemove = path.match(/^\/api\/v1\/drafts\/([^/]+)\/attachments\/([^/]+)$/);
    if (method === 'DELETE' && draftAttachmentRemove) return satisfy(200, { success: true });
    const draftSubmitMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)\/submit$/);
    if (method === 'POST' && draftSubmitMatch)
      return satisfy(200, {
        id: voice?.id ?? 'voice-1',
        displayId: voice?.displayId ?? 'CARE-202608-000001',
        status: 'OPEN',
      });
    const draftMatch = path.match(/^\/api\/v1\/drafts\/([^/]+)$/);
    if (method === 'GET' && draftMatch) return satisfy(200, opts.draft ?? draftFixture(voice));
    if (method === 'PATCH' && draftMatch) return satisfy(200, opts.draft ?? draftFixture(voice));
    if (method === 'DELETE' && draftMatch) return satisfy(200, { success: true });

    // Notifications
    if (method === 'GET' && path === '/api/v1/notifications')
      return satisfy(200, opts.notifications ?? notificationPageFixture());
    if (method === 'GET' && path === '/api/v1/notifications/unread-count')
      return satisfy(200, { count: opts.unread ?? 2 });
    if (method === 'PATCH' && path === '/api/v1/notifications/read-all')
      return satisfy(200, { updated: 1 });
    const readMatch = path.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);
    if (method === 'PATCH' && readMatch) return satisfy(200, { success: true });

    // Push
    if (method === 'GET' && path === '/api/v1/notifications/push/public-key') {
      const push = opts.push ?? {};
      return satisfy(200, {
        publicKey: push.publicKey ?? null,
        configured: push.configured ?? false,
      });
    }
    if (method === 'GET' && path === '/api/v1/notifications/push/status') {
      const push = opts.push ?? {};
      return satisfy(200, {
        configured: push.configured ?? false,
        subscriptions: push.status?.subscriptions ?? [],
      });
    }
    if (method === 'POST' && path === '/api/v1/notifications/push/subscriptions') {
      const body = await route.request().postDataJSON();
      return satisfy(200, { id: 'sub-1', active: true, installationId: body?.installationId });
    }
    const unsubscribeMatch = path.match(/^\/api\/v1\/notifications\/push\/subscriptions\/([^/]+)$/);
    if (method === 'DELETE' && unsubscribeMatch) return satisfy(200, { success: true });

    return satisfy(404, errorBody('NOT_FOUND'));
  });

  await page.route('**/api/v1/media/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
  );
}

/** Legacy thin wrapper used by earlier specs: a Member session + one voice. */
export async function mockApi(page: Page, voice: MockVoice) {
  await mockWorkforceApi(page, { voice });
}

export {
  accountFixtures,
  auditFixture,
  baseVoiceItem,
  importPreviewFixture,
  voiceDetail,
  notificationPageFixture,
};
