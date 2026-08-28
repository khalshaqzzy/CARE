import type { components, operations } from '@care/contracts';
import { normalizeApiError, type CareTransport } from '@care/frontend-core';

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

async function dataOrThrow<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (data === undefined) throw normalizeApiError(error, response.status);
  return data;
}

export type Session = components['schemas']['SessionResponse'];
export type SessionAccount = components['schemas']['SessionAccount'];
export type Capability = components['schemas']['Capability'];
export type VoiceDraft = components['schemas']['VoiceDraftResponse'];
export type VoiceDraftPreview = components['schemas']['VoiceDraftPreview'];
export type DraftListItem = components['schemas']['DraftListItem'];
export type DraftList = components['schemas']['DraftListResponse'];
export type MemberDashboard = components['schemas']['MemberDashboard'];
export type DashboardAggregate = components['schemas']['DashboardAggregate'];
export type VoiceListItem = components['schemas']['VoiceListItem'];
export type VoiceList = components['schemas']['VoiceListResponse'];
export type Attachment = components['schemas']['AttachmentResponse'];
export type Message = components['schemas']['MessageResponse'];
export type TimelinePage = components['schemas']['TimelinePage'];
export type MessagePage = components['schemas']['MessagePage'];
export type TimelineEvent = components['schemas']['TimelineEvent'];
export type LocationReview = components['schemas']['LocationReviewSnapshot'];
export type NotificationItem = components['schemas']['NotificationPage']['items'][number];
export type NotificationPage = components['schemas']['NotificationPage'];
export type AssignmentCandidate = components['schemas']['AssignmentCandidateList'][number];

export type VoiceDetail =
  operations['VoicesController_detail']['responses'][200]['content']['application/json'];

export type ClassificationPreview =
  operations['VoicesController_classify']['responses'][201]['content']['application/json'];

type VoicesQuery = NonNullable<operations['VoicesController_list']['parameters']['query']>;
type WorkItemsQuery = NonNullable<operations['VoicesController_workItems']['parameters']['query']>;
type DraftsQuery = NonNullable<operations['VoicesController_listDrafts']['parameters']['query']>;
type TimelineQuery = NonNullable<operations['VoicesController_timeline']['parameters']['query']>;
type MessagesQuery = NonNullable<operations['VoicesController_messages']['parameters']['query']>;
type DashboardQuery = NonNullable<
  operations['VoicesController_dashboardGeneral']['parameters']['query']
>;
type NotificationsQuery = NonNullable<
  operations['NotificationsController_list']['parameters']['query']
>;
type QueryInput<T> = { [K in keyof T]?: T[K] | undefined };

function compactQuery<T extends object>(query: QueryInput<T>): T {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as T;
}

function csrfHeader(): { 'X-CSRF-Token': string } {
  return { 'X-CSRF-Token': '' };
}

function csrfIdempotentHeader(key: string): { 'X-CSRF-Token': string; 'Idempotency-Key': string } {
  return { 'X-CSRF-Token': '', 'Idempotency-Key': key };
}

type DraftPatch = Partial<components['schemas']['VoiceDraftRequest']> & {
  expectedVersion?: number;
};

export function createWorkforceApi(transport: CareTransport) {
  const { client } = transport;
  return {
    dashboardMember: () => dataOrThrow<MemberDashboard>(client.GET('/api/v1/dashboard/member')),
    dashboardGeneral: (query: QueryInput<DashboardQuery> = {}) =>
      dataOrThrow<DashboardAggregate>(
        client.GET('/api/v1/dashboard/general', { params: { query: compactQuery(query) } }),
      ),
    dashboardPrivate: (query: QueryInput<DashboardQuery> = {}) =>
      dataOrThrow<DashboardAggregate>(
        client.GET('/api/v1/dashboard/private', { params: { query: compactQuery(query) } }),
      ),
    listDrafts: (query: QueryInput<DraftsQuery>) =>
      dataOrThrow<DraftList>(
        client.GET('/api/v1/drafts', { params: { query: compactQuery(query) } }),
      ),
    getDraft: (id: string) =>
      dataOrThrow<VoiceDraft>(client.GET('/api/v1/drafts/{id}', { params: { path: { id } } })),
    updateDraft: (id: string, body: DraftPatch) =>
      dataOrThrow<VoiceDraft>(
        client.PATCH('/api/v1/drafts/{id}', {
          params: { path: { id }, header: csrfHeader() },
          body: body as components['schemas']['VoiceDraftRequest'],
        }),
      ),
    createDraft: (body: components['schemas']['VoiceDraftRequest']) =>
      dataOrThrow<VoiceDraft>(
        client.POST('/api/v1/drafts', { params: { header: csrfHeader() }, body }),
      ),
    deleteDraft: (id: string) =>
      dataOrThrow(
        client.DELETE('/api/v1/drafts/{id}', { params: { path: { id }, header: csrfHeader() } }),
      ),
    previewDraft: (id: string) =>
      dataOrThrow<VoiceDraftPreview>(
        client.GET('/api/v1/drafts/{id}/preview', { params: { path: { id } } }),
      ),
    classify: (id: string) =>
      dataOrThrow<ClassificationPreview>(
        client.POST('/api/v1/drafts/{id}/classify', {
          params: { path: { id }, header: csrfHeader() },
        }),
      ),
    manualClassification: (
      id: string,
      body: components['schemas']['ManualClassificationRequest'],
    ) =>
      dataOrThrow<ClassificationPreview>(
        client.POST('/api/v1/drafts/{id}/manual-classification', {
          params: { path: { id }, header: csrfHeader() },
          body,
        }),
      ),
    reviewLocation: (id: string) =>
      dataOrThrow<LocationReview>(
        client.POST('/api/v1/drafts/{id}/location-review', {
          params: { path: { id }, header: csrfHeader() },
        }),
      ),
    getLocationReview: (id: string) =>
      dataOrThrow<LocationReview | null>(
        client.GET('/api/v1/drafts/{id}/location-review', { params: { path: { id } } }),
      ),
    uploadDraftAttachment: (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return dataOrThrow<Attachment>(
        client.POST('/api/v1/drafts/{id}/attachments', {
          params: { path: { id }, header: csrfHeader() },
          body: { file: '' },
          bodySerializer: () => form,
        }),
      );
    },
    removeDraftAttachment: (id: string, attachmentId: string) =>
      dataOrThrow(
        client.DELETE('/api/v1/drafts/{id}/attachments/{attachmentId}', {
          params: { path: { id, attachmentId }, header: csrfHeader() },
        }),
      ),
    submitDraft: (id: string, body: components['schemas']['SubmitVoiceRequest'], key: string) =>
      dataOrThrow(
        client.POST('/api/v1/drafts/{id}/submit', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    listVoices: (query: QueryInput<VoicesQuery>) =>
      dataOrThrow<VoiceList>(
        client.GET('/api/v1/voices', { params: { query: compactQuery(query) } }),
      ),
    workItems: (query: QueryInput<WorkItemsQuery>) =>
      dataOrThrow<VoiceList>(
        client.GET('/api/v1/work-items', { params: { query: compactQuery(query) } }),
      ),
    assignmentCandidates: (id: string) =>
      dataOrThrow<AssignmentCandidate[]>(
        client.GET('/api/v1/voices/{id}/assignment-candidates', { params: { path: { id } } }),
      ),
    assign: (id: string, body: components['schemas']['AssignmentRequest'], key: string) =>
      dataOrThrow<components['schemas']['VoiceMutationResponse']>(
        client.POST('/api/v1/voices/{id}/assignments', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    reassign: (id: string, body: components['schemas']['AssignmentRequest'], key: string) =>
      dataOrThrow<components['schemas']['VoiceMutationResponse']>(
        client.POST('/api/v1/voices/{id}/assignments/reassign', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    voiceDetail: (id: string) =>
      dataOrThrow<VoiceDetail>(client.GET('/api/v1/voices/{id}', { params: { path: { id } } })),
    voiceTimeline: (id: string, query: QueryInput<TimelineQuery> = {}) =>
      dataOrThrow<TimelinePage>(
        client.GET('/api/v1/voices/{id}/timeline', {
          params: { path: { id }, query: compactQuery(query) },
        }),
      ),
    voiceMessages: (id: string, query: QueryInput<MessagesQuery> = {}) =>
      dataOrThrow<MessagePage>(
        client.GET('/api/v1/voices/{id}/messages', {
          params: { path: { id }, query: compactQuery(query) },
        }),
      ),
    sendMessage: (id: string, text: string, files: File[], key: string) => {
      const form = new FormData();
      if (text) form.append('text', text);
      for (const file of files) form.append('files', file);
      return dataOrThrow<Message>(
        client.POST('/api/v1/voices/{id}/messages', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body: { text: '' },
          bodySerializer: () => form,
        }),
      );
    },
    rate: (id: string, body: components['schemas']['RatingRequest'], key: string) =>
      dataOrThrow(
        client.POST('/api/v1/voices/{id}/rate', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    ask: (id: string, body: components['schemas']['VoiceTextMutationRequest'], key: string) =>
      dataOrThrow(
        client.POST('/api/v1/voices/{id}/ask', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    proceed: (id: string, body: components['schemas']['VersionedMutationRequest'], key: string) =>
      dataOrThrow(
        client.POST('/api/v1/voices/{id}/proceed', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    close: (id: string, body: components['schemas']['CloseVoiceRequest'], key: string) =>
      dataOrThrow(
        client.POST('/api/v1/voices/{id}/close', {
          params: { path: { id }, header: csrfIdempotentHeader(key) },
          body,
        }),
      ),
    stageEvidence: (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return dataOrThrow<Attachment>(
        client.POST('/api/v1/voices/{id}/closure-evidence', {
          params: { path: { id }, header: csrfHeader() },
          body: { file: '' },
          bodySerializer: () => form,
        }),
      );
    },
    notifications: (query: QueryInput<NotificationsQuery>) =>
      dataOrThrow<NotificationPage>(
        client.GET('/api/v1/notifications', { params: { query: compactQuery(query) } }),
      ),
    unreadCount: () =>
      dataOrThrow<components['schemas']['UnreadCountResponse']>(
        client.GET('/api/v1/notifications/unread-count'),
      ),
    markAllRead: () =>
      dataOrThrow<components['schemas']['UpdatedCountResponse']>(
        client.PATCH('/api/v1/notifications/read-all', { params: { header: csrfHeader() } }),
      ),
    markRead: (id: string) =>
      dataOrThrow<components['schemas']['SuccessResponse']>(
        client.PATCH('/api/v1/notifications/{id}/read', {
          params: { path: { id }, header: csrfHeader() },
        }),
      ),
    pushPublicKey: () =>
      dataOrThrow<components['schemas']['PushPublicKeyResponse']>(
        client.GET('/api/v1/notifications/push/public-key'),
      ),
    pushStatus: () =>
      dataOrThrow<components['schemas']['PushStatusResponse']>(
        client.GET('/api/v1/notifications/push/status'),
      ),
    subscribePush: (body: components['schemas']['PushSubscriptionRequest']) =>
      dataOrThrow<components['schemas']['PushSubscriptionResponse']>(
        client.POST('/api/v1/notifications/push/subscriptions', {
          params: { header: csrfHeader() },
          body,
        }),
      ),
    unsubscribePush: (installationId: string) =>
      dataOrThrow<components['schemas']['SuccessResponse']>(
        client.DELETE('/api/v1/notifications/push/subscriptions/{installationId}', {
          params: { path: { installationId }, header: csrfHeader() },
        }),
      ),
  };
}

export type WorkforceApi = ReturnType<typeof createWorkforceApi>;
