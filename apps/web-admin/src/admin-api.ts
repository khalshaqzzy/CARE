import type { components, operations } from '@care/contracts';
import { normalizeApiError, type CareTransport } from '@care/frontend-core';

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

async function dataOrThrow<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (data === undefined) throw normalizeApiError(error, response.status);
  return data;
}

export type Account = components['schemas']['AccountSummary'];
export type AccountList = components['schemas']['AccountSummaryList'];
export type AdminOverview = components['schemas']['AdminOverview'];
export type ImportPreview = components['schemas']['OrganizationImportPreview'];
export type ImportList = components['schemas']['OrganizationImportList'];
export type ImportChanges = components['schemas']['OrganizationChangeList'];
export type RemediationList = components['schemas']['RemediationIssueList'];
export type RemediationHistory = components['schemas']['RemediationResolutionList'];
export type UnionAccountList = components['schemas']['UnionAccountList'];
export type AuditEventList = components['schemas']['AuditEventList'];
export type AuditEvent = components['schemas']['AuditEvent'];
export type VoiceList = components['schemas']['VoiceListResponse'];
export type VoiceItem = components['schemas']['VoiceListItem'];
export type VoiceDetail =
  operations['VoicesController_detail']['responses'][200]['content']['application/json'];
export type VoiceTimeline = components['schemas']['TimelinePage'];
export type VoiceMessages = components['schemas']['MessagePage'];
type AccountsQuery = NonNullable<operations['AdminController_accounts']['parameters']['query']>;
type RemediationQuery = NonNullable<operations['AdminController_issues']['parameters']['query']>;
type RemediationHistoryQuery = NonNullable<
  operations['AdminController_resolutions']['parameters']['query']
>;
type AuditQuery = NonNullable<operations['AdminController_auditEvents']['parameters']['query']>;
type ImportsQuery = NonNullable<operations['ImportsController_list']['parameters']['query']>;
type ImportChangesQuery = NonNullable<
  operations['ImportsController_changes']['parameters']['query']
>;
type VoicesQuery = NonNullable<operations['VoicesController_list']['parameters']['query']>;
type TimelineQuery = NonNullable<operations['VoicesController_timeline']['parameters']['query']>;
type MessagesQuery = NonNullable<operations['VoicesController_messages']['parameters']['query']>;
type QueryInput<T> = { [K in keyof T]?: T[K] | undefined };

function compactQuery<T extends object>(query: QueryInput<T>): T {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as T;
}

export function createAdminApi(transport: CareTransport) {
  const { client } = transport;
  return {
    overview: () => dataOrThrow(client.GET('/api/v1/admin/overview')),
    accounts: (query: QueryInput<AccountsQuery>) =>
      dataOrThrow<AccountList>(
        client.GET('/api/v1/admin/accounts', { params: { query: compactQuery(query) } }),
      ),
    account: (id: string) =>
      dataOrThrow<Account>(client.GET('/api/v1/admin/accounts/{id}', { params: { path: { id } } })),
    resetPassword: (id: string, idempotencyKey: string) =>
      dataOrThrow(
        client.POST('/api/v1/admin/accounts/{id}/reset-password', {
          params: {
            path: { id },
            header: { 'X-CSRF-Token': '', 'Idempotency-Key': idempotencyKey },
          },
        }),
      ),
    setAccountStatus: (
      id: string,
      body: components['schemas']['AccountStatusRequest'],
      idempotencyKey: string,
    ) =>
      dataOrThrow<Account>(
        client.POST('/api/v1/admin/accounts/{id}/status', {
          params: {
            path: { id },
            header: { 'X-CSRF-Token': '', 'Idempotency-Key': idempotencyKey },
          },
          body,
        }),
      ),
    remediation: (query: QueryInput<RemediationQuery>) =>
      dataOrThrow<RemediationList>(
        client.GET('/api/v1/admin/remediation-issues', {
          params: { query: compactQuery(query) },
        }),
      ),
    remediationHistory: (query: QueryInput<RemediationHistoryQuery>) =>
      dataOrThrow<RemediationHistory>(
        client.GET('/api/v1/admin/remediation-issues/history', {
          params: { query: compactQuery(query) },
        }),
      ),
    sectionHeads: (id: string) =>
      dataOrThrow(
        client.GET('/api/v1/admin/organization-units/{id}/section-head-candidates', {
          params: { path: { id } },
        }),
      ),
    setDefaultPic: (
      id: string,
      body: components['schemas']['AccountSelectionRequest'],
      idempotencyKey: string,
    ) =>
      dataOrThrow(
        client.PUT('/api/v1/admin/organization-units/{id}/default-pic', {
          params: {
            path: { id },
            header: { 'X-CSRF-Token': '', 'Idempotency-Key': idempotencyKey },
          },
          body,
        }),
      ),
    setGlobalPic: (
      body: components['schemas']['AccountSelectionRequest'],
      idempotencyKey: string,
    ) =>
      dataOrThrow(
        client.PUT('/api/v1/admin/routes/global-special-pic', {
          params: { header: { 'X-CSRF-Token': '', 'Idempotency-Key': idempotencyKey } },
          body,
        }),
      ),
    unionAccounts: () => dataOrThrow<UnionAccountList>(client.GET('/api/v1/admin/union-accounts')),
    setUnionAccount: (
      slot: string,
      body: components['schemas']['UnionAccountRequest'],
      idempotencyKey: string,
    ) =>
      dataOrThrow(
        client.PUT('/api/v1/admin/union-accounts/{slot}', {
          params: {
            path: { slot },
            header: { 'X-CSRF-Token': '', 'Idempotency-Key': idempotencyKey },
          },
          body,
        }),
      ),
    auditEvents: (query: QueryInput<AuditQuery>) =>
      dataOrThrow<AuditEventList>(
        client.GET('/api/v1/admin/audit-events', { params: { query: compactQuery(query) } }),
      ),
    auditEvent: (id: string) =>
      dataOrThrow<AuditEvent>(
        client.GET('/api/v1/admin/audit-events/{id}', { params: { path: { id } } }),
      ),
    imports: (query: QueryInput<ImportsQuery>) =>
      dataOrThrow<ImportList>(
        client.GET('/api/v1/admin/organization-imports', {
          params: { query: compactQuery(query) },
        }),
      ),
    importDetail: (id: string) =>
      dataOrThrow<ImportPreview>(
        client.GET('/api/v1/admin/organization-imports/{id}', { params: { path: { id } } }),
      ),
    importChanges: (id: string, query: QueryInput<ImportChangesQuery>) =>
      dataOrThrow<ImportChanges>(
        client.GET('/api/v1/admin/organization-imports/{id}/changes', {
          params: { path: { id }, query: compactQuery(query) },
        }),
      ),
    currentSnapshot: () => dataOrThrow(client.GET('/api/v1/admin/organization-snapshots/current')),
    previewImport: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return dataOrThrow<ImportPreview>(
        client.POST('/api/v1/admin/organization-imports/preview', {
          params: { header: { 'X-CSRF-Token': '' } },
          body: { file: '' },
          bodySerializer: () => form,
        }),
      );
    },
    confirmImport: (
      id: string,
      body: components['schemas']['ConfirmImportRequest'],
      idempotencyKey: string,
    ) =>
      dataOrThrow(
        client.POST('/api/v1/admin/organization-imports/{id}/confirm', {
          params: {
            path: { id },
            header: { 'X-CSRF-Token': '', 'Idempotency-Key': idempotencyKey },
          },
          body,
        }),
      ),
    voices: (query: QueryInput<VoicesQuery>) =>
      dataOrThrow<VoiceList>(
        client.GET('/api/v1/voices', { params: { query: compactQuery(query) } }),
      ),
    voice: (id: string) =>
      dataOrThrow<VoiceDetail>(client.GET('/api/v1/voices/{id}', { params: { path: { id } } })),
    voiceTimeline: (id: string, query: QueryInput<TimelineQuery> = {}) =>
      dataOrThrow<VoiceTimeline>(
        client.GET('/api/v1/voices/{id}/timeline', {
          params: { path: { id }, query: compactQuery(query) },
        }),
      ),
    voiceMessages: (id: string, query: QueryInput<MessagesQuery> = {}) =>
      dataOrThrow<VoiceMessages>(
        client.GET('/api/v1/voices/{id}/messages', {
          params: { path: { id }, query: compactQuery(query) },
        }),
      ),
    health: () => dataOrThrow<components['schemas']['Health']>(client.GET('/health')),
    ready: () => dataOrThrow<components['schemas']['Readiness']>(client.GET('/ready')),
    release: () => dataOrThrow<components['schemas']['Release']>(client.GET('/release.json')),
  };
}
