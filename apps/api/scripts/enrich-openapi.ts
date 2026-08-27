import type { OpenAPIObject } from '@nestjs/swagger';

type MutableOperation = Record<string, any>;

const errorExamples: Record<string, { code: string; message: string }> = {
  '400': { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
  '401': { code: 'UNAUTHENTICATED', message: 'Authentication is required' },
  '404': { code: 'NOT_FOUND', message: 'Resource not found' },
  '409': { code: 'VERSION_CONFLICT', message: 'The resource changed; reload and retry' },
  '422': { code: 'MANUAL_CLASSIFICATION_REQUIRED', message: 'Manual classification is required' },
  '429': { code: 'RATE_LIMITED', message: 'Too many requests; try again later' },
};

export function enrichOpenApi(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas = schemas as NonNullable<OpenAPIObject['components']>['schemas'];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem?.[method] as MutableOperation | undefined;
      if (!operation) continue;
      operation.parameters ??= [];
      for (const name of path.matchAll(/\{([^}]+)\}/g)) {
        if (!operation.parameters.some((parameter: MutableOperation) => parameter.name === name[1]))
          operation.parameters.push({
            name: name[1],
            in: 'path',
            required: true,
            schema: { type: 'string' },
          });
      }
      for (const parameter of queryParameters[operation.operationId] ?? [])
        if (!operation.parameters.some((existing: MutableOperation) => existing.name === parameter))
          operation.parameters.push({
            name: parameter,
            in: 'query',
            required: false,
            schema:
              parameter === 'limit'
                ? { type: 'integer', minimum: 1, maximum: 100 }
                : { type: 'string' },
          });
      if (method !== 'get' && path !== '/api/v1/auth/login') {
        addHeader(operation, 'X-CSRF-Token', true, 'Session-bound CSRF token');
      }
      if (
        method !== 'get' &&
        (path.includes('/voices/') ||
          path.endsWith('/submit') ||
          idempotentOperations.has(operation.operationId)) &&
        !path.includes('attachments') &&
        !path.includes('closure-evidence')
      )
        addHeader(operation, 'Idempotency-Key', true, 'Unique key for safe mutation retries');
      const multipartSchema = multipartRequestSchema(operation.operationId);
      if (multipartSchema)
        operation.requestBody = {
          required: true,
          content: { 'multipart/form-data': { schema: multipartSchema } },
        };
      const hasMultipart = operation.requestBody?.content?.['multipart/form-data'];
      if (
        method !== 'get' &&
        method !== 'delete' &&
        !operation.requestBody &&
        !hasMultipart &&
        !noBodyOperations.has(operation.operationId)
      )
        operation.requestBody = {
          required: true,
          content: {
            'application/json': { schema: requestSchema(operation.operationId) },
          },
        };
      for (const [status, example] of Object.entries(errorExamples)) {
        operation.responses[status] = {
          description: example.message,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorEnvelope' },
              example: { ...example, errors: [], correlationId: '01HZZEXAMPLECORRELATION' },
            },
          },
        };
      }
      for (const [status, response] of Object.entries(operation.responses) as [
        string,
        MutableOperation,
      ][]) {
        if (status.startsWith('2')) {
          const json = response.content?.['application/json'];
          if (json) json.schema = successSchema(operation.operationId);
          else if (!response.content)
            response.content = {
              'application/json': { schema: successSchema(operation.operationId) },
            };
        }
      }
    }
  }
  return document;
}

const queryParameters: Record<string, string[]> = {
  AdminController_accounts: [
    'search',
    'kind',
    'status',
    'unitId',
    'position',
    'eligibility',
    'cursor',
    'limit',
  ],
  AdminController_issues: ['status', 'type', 'organizationUnitId', 'batchId', 'cursor', 'limit'],
  AdminController_resolutions: ['cursor', 'limit', 'type', 'status'],
  AdminController_auditEvents: [
    'cursor',
    'limit',
    'from',
    'to',
    'action',
    'result',
    'actorKind',
    'resourceType',
    'resourceId',
    'correlationId',
  ],
  ImportsController_list: ['cursor', 'limit', 'status'],
  ImportsController_changes: ['cursor', 'limit', 'filter'],
  OrganizationUnitsController_list: ['cursor', 'limit', 'search'],
  VoicesController_list: [
    'cursor',
    'limit',
    'search',
    'status',
    'visibility',
    'severity',
    'area',
    'category',
    'handler',
    'dateFrom',
    'dateTo',
    'sort',
  ],
  VoicesController_workItems: [
    'cursor',
    'limit',
    'search',
    'status',
    'severity',
    'area',
    'category',
    'dateFrom',
    'dateTo',
  ],
  VoicesController_listDrafts: ['cursor', 'limit'],
  NotificationsController_list: ['cursor', 'limit'],
};

const idempotentOperations = new Set([
  'AdminController_resetPassword',
  'AdminController_setStatus',
  'AdminController_defaultPic',
  'AdminController_globalPic',
  'AdminController_unionAccount',
  'ImportsController_confirm',
]);

const noBodyOperations = new Set([
  'AuthController_logout',
  'VoicesController_classify',
  'VoicesController_locationReview',
  'NotificationsController_readAll',
  'NotificationsController_read',
  'AdminController_accounts',
  'AdminController_overview',
  'AdminController_accountDetail',
  'AdminController_resetPassword',
  'AdminController_issues',
  'AdminController_resolutions',
  'AdminController_sectionHeads',
  'AdminController_unionAccounts',
  'AdminController_auditEvents',
  'AdminController_auditDetail',
  'ImportsController_list',
  'ImportsController_detail',
  'ImportsController_changes',
  'OrganizationSnapshotsController_current',
  'OrganizationUnitsController_list',
  'OrganizationUnitsController_detail',
]);

function addHeader(
  operation: MutableOperation,
  name: string,
  required: boolean,
  description: string,
) {
  if (!operation.parameters.some((parameter: MutableOperation) => parameter.name === name))
    operation.parameters.push({
      name,
      in: 'header',
      required,
      description,
      schema: { type: 'string' },
    });
}

function successSchema(operationId: string) {
  if (operationId === 'VoicesController_detail')
    return {
      oneOf: [
        { $ref: '#/components/schemas/ReporterSelfVoiceDetail' },
        { $ref: '#/components/schemas/GeneralResponderVoiceDetail' },
        { $ref: '#/components/schemas/LeadershipGeneralVoiceDetail' },
        { $ref: '#/components/schemas/UnionAnonymousVoiceDetail' },
        { $ref: '#/components/schemas/UnionIdentifiedVoiceDetail' },
        { $ref: '#/components/schemas/AdminPrivateVoiceDetail' },
      ],
      discriminator: {
        propertyName: 'audience',
        mapping: {
          REPORTER_SELF: '#/components/schemas/ReporterSelfVoiceDetail',
          GENERAL_RESPONDER: '#/components/schemas/GeneralResponderVoiceDetail',
          LEADERSHIP_GENERAL_READ_ONLY: '#/components/schemas/LeadershipGeneralVoiceDetail',
          UNION_ANONYMOUS: '#/components/schemas/UnionAnonymousVoiceDetail',
          UNION_IDENTIFIED: '#/components/schemas/UnionIdentifiedVoiceDetail',
          ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY: '#/components/schemas/AdminPrivateVoiceDetail',
        },
      },
    };
  if (operationId === 'VoicesController_classify' || operationId === 'VoicesController_manual')
    return { $ref: '#/components/schemas/ClassificationPreview' };
  if (
    operationId === 'VoicesController_locationReview' ||
    operationId === 'VoicesController_getLocationReview'
  )
    return { $ref: '#/components/schemas/LocationReviewSnapshot' };
  if (
    operationId === 'VoicesController_dashboardGeneral' ||
    operationId === 'VoicesController_dashboardPrivate'
  )
    return { $ref: '#/components/schemas/DashboardAggregate' };
  if (operationId === 'VoicesController_dashboardMember')
    return { $ref: '#/components/schemas/MemberDashboard' };
  if (operationId === 'VoicesController_listDrafts')
    return { $ref: '#/components/schemas/DraftListResponse' };
  if (operationId === 'ImportsController_preview' || operationId === 'ImportsController_detail')
    return { $ref: '#/components/schemas/OrganizationImportPreview' };
  if (operationId === 'HealthController_health') return { $ref: '#/components/schemas/Health' };
  if (operationId === 'HealthController_ready') return { $ref: '#/components/schemas/Readiness' };
  if (operationId === 'HealthController_release') return { $ref: '#/components/schemas/Release' };
  if (operationId === 'AuthController_csrf') return { $ref: '#/components/schemas/CsrfToken' };
  if (operationId === 'AuthController_login') return { $ref: '#/components/schemas/LoginResponse' };
  if (operationId === 'AuthController_session')
    return { $ref: '#/components/schemas/SessionResponse' };
  const mapping: Record<string, string> = {
    AdminController_overview: 'AdminOverview',
    AdminController_accounts: 'AccountSummaryList',
    AdminController_accountDetail: 'AccountSummary',
    AdminController_resetPassword: 'AccountResetResponse',
    AdminController_setStatus: 'AccountSummary',
    AdminController_auditEvents: 'AuditEventList',
    AdminController_auditDetail: 'AuditEvent',
    AdminController_defaultPic: 'RouteMappingResponse',
    AdminController_globalPic: 'RouteMappingResponse',
    AdminController_issues: 'RemediationIssueList',
    AdminController_resolutions: 'RemediationResolutionList',
    AdminController_sectionHeads: 'SectionHeadCandidateList',
    AdminController_unionAccount: 'UnionProvisionResponse',
    AdminController_unionAccounts: 'UnionAccountList',
    ImportsController_detail: 'OrganizationImportPreview',
    ImportsController_preview: 'OrganizationImportPreview',
    OrganizationSnapshotsController_current: 'OrganizationSnapshot',
    OrganizationUnitsController_list: 'OrganizationUnitList',
    OrganizationUnitsController_detail: 'OrganizationUnit',
    AuthController_changePassword: 'SuccessResponse',
    AuthController_logout: 'SuccessResponse',
    ImportsController_changes: 'OrganizationChangeList',
    ImportsController_confirm: 'ImportQueuedResponse',
    ImportsController_list: 'OrganizationImportList',
    MetricsController_metrics: 'MetricsText',
    NotificationsController_list: 'NotificationPage',
    NotificationsController_publicKey: 'PushPublicKeyResponse',
    NotificationsController_read: 'SuccessResponse',
    NotificationsController_readAll: 'UpdatedCountResponse',
    NotificationsController_status: 'PushStatusResponse',
    NotificationsController_subscribe: 'PushSubscriptionResponse',
    NotificationsController_unread: 'UnreadCountResponse',
    NotificationsController_unsubscribe: 'SuccessResponse',
    VoicesController_addDraftAttachment: 'AttachmentResponse',
    VoicesController_ask: 'VoiceMutationResponse',
    VoicesController_assign: 'VoiceMutationResponse',
    VoicesController_close: 'ClosureResponse',
    VoicesController_conversations: 'ConversationList',
    VoicesController_createDraft: 'VoiceDraftResponse',
    VoicesController_deleteDraft: 'SuccessResponse',
    VoicesController_evidence: 'AttachmentResponse',
    VoicesController_getDraft: 'VoiceDraftResponse',
    VoicesController_list: 'VoiceListResponse',
    VoicesController_mediaFile: 'MediaBinary',
    VoicesController_message: 'MessageResponse',
    VoicesController_messages: 'MessageList',
    VoicesController_previewDraft: 'VoiceDraftPreview',
    VoicesController_proceed: 'VoiceMutationResponse',
    VoicesController_rate: 'RatingResponse',
    VoicesController_reassign: 'VoiceMutationResponse',
    VoicesController_removeDraftAttachment: 'SuccessResponse',
    VoicesController_submit: 'VoiceSubmittedResponse',
    VoicesController_timeline: 'TimelineResponse',
    VoicesController_updateDraft: 'VoiceDraftResponse',
    VoicesController_workItems: 'VoiceListResponse',
  };
  const schema = mapping[operationId];
  if (!schema) throw new Error(`Missing explicit OpenAPI response schema for ${operationId}`);
  return { $ref: `#/components/schemas/${schema}` };
}

function requestSchema(operationId: string) {
  const mapping: Record<string, string> = {
    VoicesController_createDraft: 'VoiceDraftRequest',
    VoicesController_updateDraft: 'VoiceDraftRequest',
    VoicesController_manual: 'ManualClassificationRequest',
    VoicesController_submit: 'SubmitVoiceRequest',
    VoicesController_assign: 'AssignmentRequest',
    VoicesController_reassign: 'AssignmentRequest',
    AdminController_defaultPic: 'AccountSelectionRequest',
    AdminController_globalPic: 'AccountSelectionRequest',
    AdminController_unionAccount: 'UnionAccountRequest',
    AdminController_setStatus: 'AccountStatusRequest',
    ImportsController_confirm: 'ConfirmImportRequest',
    AuthController_login: 'LoginRequest',
    AuthController_changePassword: 'ChangePasswordRequest',
    NotificationsController_subscribe: 'PushSubscriptionRequest',
    VoicesController_ask: 'VoiceTextMutationRequest',
    VoicesController_proceed: 'VersionedMutationRequest',
    VoicesController_close: 'CloseVoiceRequest',
    VoicesController_rate: 'RatingRequest',
  };
  const schema = mapping[operationId];
  if (!schema) throw new Error(`Missing explicit OpenAPI request schema for ${operationId}`);
  return { $ref: `#/components/schemas/${schema}` };
}

function multipartRequestSchema(operationId: string) {
  const mapping: Record<string, string> = {
    ImportsController_preview: 'OrganizationFileUploadRequest',
    VoicesController_addDraftAttachment: 'ImageUploadRequest',
    VoicesController_evidence: 'ImageUploadRequest',
    VoicesController_message: 'MessageUploadRequest',
  };
  return mapping[operationId]
    ? { $ref: `#/components/schemas/${mapping[operationId]}` }
    : undefined;
}

const baseVoiceProperties = {
  id: { type: 'string', format: 'uuid' },
  displayId: { type: 'string', example: 'CARE-202608-000001' },
  audience: { type: 'string' },
  visibility: { type: 'string', enum: ['GENERAL', 'PRIVATE'] },
  area: {
    type: 'string',
    enum: ['KARAWANG_1', 'KARAWANG_2', 'KARAWANG_3', 'SUNTER_1', 'SUNTER_2'],
  },
  locationDetail: { type: 'string' },
  title: { type: 'string' },
  detail: { type: 'string' },
  category: {
    type: 'string',
    nullable: true,
    enum: ['SAFETY', 'ENVIRONMENT', 'FACILITY', 'WORK_DIFFICULTY'],
  },
  severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  status: { type: 'string', enum: ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'] },
  version: { type: 'integer', minimum: 1 },
  submittedAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  classificationSource: {
    type: 'string',
    nullable: true,
    enum: ['AI', 'MANUAL_FALLBACK'],
  },
  availableActions: { type: 'array', items: { type: 'string' } },
  closureCycles: {
    type: 'array',
    items: { $ref: '#/components/schemas/ClosureCycleResponse' },
  },
  routeOwner: {
    type: 'object',
    required: ['id', 'displayName'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      displayName: { type: 'string' },
    },
  },
  currentHandler: {
    type: 'object',
    nullable: true,
    required: ['id', 'displayName'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      displayName: { type: 'string' },
    },
  },
  attachments: {
    type: 'array',
    items: { $ref: '#/components/schemas/AttachmentResponse' },
  },
  locationReview: {
    allOf: [{ $ref: '#/components/schemas/LocationReviewSnapshot' }],
    nullable: true,
  },
};

const sessionBaseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'account',
    'workforceProfile',
    'unionProfile',
    'capabilities',
    'scopes',
    'sessionId',
    'passwordChangeRequired',
  ],
  properties: {
    account: { $ref: '#/components/schemas/SessionAccount' },
    workforceProfile: {
      allOf: [{ $ref: '#/components/schemas/SessionWorkforceProfile' }],
      nullable: true,
    },
    unionProfile: {
      allOf: [{ $ref: '#/components/schemas/SessionUnionProfile' }],
      nullable: true,
    },
    capabilities: {
      type: 'array',
      items: { $ref: '#/components/schemas/Capability' },
    },
    scopes: {
      type: 'object',
      additionalProperties: false,
      required: ['overview', 'detail', 'action'],
      properties: {
        overview: { type: 'array', items: { $ref: '#/components/schemas/OverviewScope' } },
        detail: { type: 'array', items: { $ref: '#/components/schemas/DetailScope' } },
        action: { type: 'array', items: { $ref: '#/components/schemas/ActionScope' } },
      },
    },
    sessionId: { type: 'string', format: 'uuid' },
    passwordChangeRequired: { type: 'boolean' },
  },
};

const schemas: Record<string, any> = {
  ErrorEnvelope: {
    type: 'object',
    required: ['code', 'message', 'errors', 'correlationId'],
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      errors: { type: 'array', items: { $ref: '#/components/schemas/FieldError' } },
      correlationId: { type: 'string' },
      meta: { type: 'object', additionalProperties: true },
    },
  },
  FieldError: {
    type: 'object',
    required: ['field', 'code', 'message'],
    properties: {
      field: { type: 'string' },
      code: { type: 'string' },
      message: { type: 'string' },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: { username: { type: 'string' }, password: { type: 'string', format: 'password' } },
  },
  VoiceDraftRequest: {
    type: 'object',
    required: ['area', 'locationDetail', 'title', 'detail', 'visibility'],
    additionalProperties: false,
    properties: {
      area: baseVoiceProperties.area,
      locationDetail: { type: 'string' },
      title: { type: 'string' },
      detail: { type: 'string' },
      visibility: baseVoiceProperties.visibility,
      showReporterIdentity: { type: 'boolean', description: 'Required only for Private Voice' },
    },
  },
  ManualClassificationRequest: {
    type: 'object',
    required: ['severity'],
    additionalProperties: false,
    properties: { category: baseVoiceProperties.category, severity: baseVoiceProperties.severity },
  },
  SubmitVoiceRequest: {
    type: 'object',
    required: ['version'],
    additionalProperties: false,
    properties: {
      version: { type: 'integer', minimum: 1 },
      locationReviewId: { type: 'string', format: 'uuid', nullable: true },
      locationContentHash: { type: 'string', minLength: 64, maxLength: 64, nullable: true },
      acknowledgeIncompleteLocation: { type: 'boolean' },
    },
  },
  AssignmentRequest: {
    type: 'object',
    required: ['handlerAccountId'],
    additionalProperties: false,
    properties: {
      handlerAccountId: { type: 'string', format: 'uuid' },
      reason: { type: 'string', maxLength: 500 },
    },
  },
  AccountSelectionRequest: {
    type: 'object',
    required: ['accountId', 'expectedCurrentRouteId', 'reason'],
    additionalProperties: false,
    properties: {
      accountId: { type: 'string', format: 'uuid' },
      expectedCurrentRouteId: { type: 'string', format: 'uuid', nullable: true },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
  UnionAccountRequest: {
    type: 'object',
    required: ['username', 'displayName', 'expectedCurrentTerm', 'reason'],
    additionalProperties: false,
    properties: {
      username: { type: 'string' },
      displayName: { type: 'string' },
      expectedCurrentTerm: { type: 'string', format: 'uuid', nullable: true },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
  ChangePasswordRequest: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    additionalProperties: false,
    properties: {
      currentPassword: { type: 'string', format: 'password' },
      newPassword: { type: 'string', format: 'password', minLength: 6, maxLength: 128 },
    },
  },
  VoiceTextMutationRequest: {
    type: 'object',
    required: ['text', 'version'],
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 4000 },
      version: { type: 'integer', minimum: 1 },
    },
  },
  VersionedMutationRequest: {
    type: 'object',
    required: ['version'],
    additionalProperties: false,
    properties: { version: { type: 'integer', minimum: 1 } },
  },
  CloseVoiceRequest: {
    type: 'object',
    required: ['note', 'version'],
    additionalProperties: false,
    properties: {
      note: { type: 'string', minLength: 1, maxLength: 4000 },
      version: { type: 'integer', minimum: 1 },
    },
  },
  RatingRequest: {
    type: 'object',
    required: ['score'],
    additionalProperties: false,
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 5 },
      feedback: { type: 'string', maxLength: 2000 },
      reopen: { type: 'boolean' },
    },
  },
  PushSubscriptionRequest: {
    type: 'object',
    required: ['installationId', 'endpoint', 'keys'],
    additionalProperties: false,
    properties: {
      installationId: { type: 'string', minLength: 8, maxLength: 200 },
      endpoint: { type: 'string', format: 'uri' },
      keys: {
        type: 'object',
        required: ['p256dh', 'auth'],
        additionalProperties: false,
        properties: { p256dh: { type: 'string' }, auth: { type: 'string' } },
      },
    },
  },
  OrganizationFileUploadRequest: {
    type: 'object',
    required: ['file'],
    additionalProperties: false,
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: 'Authoritative organization snapshot in .xlsx or UTF-8 .csv format',
      },
    },
  },
  ImageUploadRequest: {
    type: 'object',
    required: ['file'],
    additionalProperties: false,
    properties: { file: { type: 'string', format: 'binary' } },
  },
  MessageUploadRequest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', maxLength: 4000 },
      files: { type: 'array', maxItems: 5, items: { type: 'string', format: 'binary' } },
    },
  },
  PagedResponse: {
    type: 'object',
    required: ['items', 'nextCursor'],
    properties: {
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      nextCursor: { type: 'string', nullable: true, description: 'Signed opaque cursor' },
    },
  },
  Health: {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', example: 'ok' } },
  },
  Readiness: {
    type: 'object',
    required: ['status', 'checks', 'dependencies', 'config'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['ready', 'not_ready'] },
      checks: {
        type: 'object',
        required: ['database', 'migrations', 'outbox', 'storage'],
        additionalProperties: false,
        properties: {
          database: { type: 'string' },
          migrations: { type: 'string' },
          outbox: { type: 'string' },
          storage: { type: 'string' },
        },
      },
      dependencies: {
        type: 'object',
        required: ['openai', 'push'],
        additionalProperties: false,
        properties: { openai: { type: 'string' }, push: { type: 'string' } },
      },
      config: {
        type: 'object',
        required: ['environment', 'releaseSha', 'mediaRoot', 'openai', 'push'],
        additionalProperties: false,
        properties: {
          environment: { type: 'string' },
          releaseSha: { type: 'string' },
          mediaRoot: { type: 'string' },
          openai: {
            type: 'object',
            required: ['configured', 'model'],
            additionalProperties: false,
            properties: {
              configured: { type: 'boolean' },
              model: { type: 'string', nullable: true },
            },
          },
          push: {
            type: 'object',
            required: ['configured'],
            additionalProperties: false,
            properties: { configured: { type: 'boolean' } },
          },
        },
      },
    },
  },
  Release: {
    type: 'object',
    required: ['releaseSha', 'service'],
    properties: { releaseSha: { type: 'string' }, service: { type: 'string', enum: ['care-api'] } },
  },
  CsrfToken: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
  LoginResponse: sessionBaseSchema,
  SessionResponse: {
    ...sessionBaseSchema,
    required: [...sessionBaseSchema.required, 'employee'],
    properties: {
      ...sessionBaseSchema.properties,
      employee: {
        allOf: [{ $ref: '#/components/schemas/SessionEmployee' }],
        nullable: true,
        description: 'Authoritative employee snapshot returned by the session endpoint.',
      },
    },
  },
  SessionAccount: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'username', 'displayName', 'accountKind', 'status'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      displayName: { type: 'string' },
      accountKind: { type: 'string', enum: ['CARE_ADMIN', 'WORKFORCE', 'UNION'] },
      status: { type: 'string', enum: ['ACTIVE', 'LEGACY_HANDLER', 'INACTIVE'] },
    },
  },
  SessionWorkforceProfile: {
    type: 'object',
    additionalProperties: false,
    required: ['structuralPosition', 'organizationSnapshotId', 'organizationUnitId'],
    properties: {
      structuralPosition: { type: 'string', nullable: true },
      organizationSnapshotId: { type: 'string', format: 'uuid', nullable: true },
      organizationUnitId: { type: 'string', format: 'uuid', nullable: true },
    },
  },
  SessionUnionProfile: {
    type: 'object',
    additionalProperties: false,
    required: ['slot'],
    properties: {
      slot: { type: 'string', enum: ['HEAD', 'OFFICER_1', 'OFFICER_2'] },
    },
  },
  SessionEmployee: {
    type: 'object',
    additionalProperties: false,
    required: [
      'noReg',
      'name',
      'directorate',
      'division',
      'department',
      'section',
      'structuralPosition',
    ],
    properties: {
      noReg: { type: 'string' },
      name: { type: 'string' },
      directorate: { type: 'string', nullable: true },
      division: { type: 'string', nullable: true },
      department: { type: 'string', nullable: true },
      section: { type: 'string', nullable: true },
      structuralPosition: { type: 'string', nullable: true },
    },
  },
  Capability: {
    type: 'string',
    enum: [
      'MEMBER',
      'SECTION_HEAD',
      'MANAGER',
      'DIVISION_LEADERSHIP',
      'DIRECTOR',
      'UNION_HEAD',
      'UNION_OFFICER',
      'CARE_ADMIN',
    ],
  },
  OverviewScope: {
    type: 'string',
    enum: ['OWN', 'GENERAL_GLOBAL', 'ADMIN_OPERATIONAL', 'GENERAL_OWN_DIVISION'],
  },
  DetailScope: {
    type: 'string',
    enum: [
      'OWN',
      'GENERAL_ALL',
      'PRIVATE_ALL_READ_ONLY',
      'GENERAL_OWN_DIVISION',
      'GENERAL_OWN_DEPARTMENT',
      'EXPLICIT_WORK_ITEMS',
      'ASSIGNED',
    ],
  },
  ActionScope: {
    type: 'string',
    enum: [
      'REPORTER_OWN',
      'ROUTE_OWNED_GENERAL',
      'ASSIGNED_GENERAL',
      'PRIVATE_ALL',
      'PRIVATE_ASSIGNED',
    ],
  },
  ClassificationPreview: {
    oneOf: [
      {
        type: 'object',
        required: ['source', 'category', 'severity', 'confidence', 'rationaleCode'],
        properties: {
          source: { type: 'string', enum: ['AI', 'MANUAL_FALLBACK'] },
          category: baseVoiceProperties.category,
          severity: baseVoiceProperties.severity,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationaleCode: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['source', 'fallbackCode'],
        properties: {
          source: { type: 'string', enum: ['MANUAL_FALLBACK'] },
          fallbackCode: { type: 'string' },
        },
      },
    ],
  },
  ReporterSelfVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'reporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['REPORTER_SELF'] },
      reporter: {
        type: 'object',
        required: ['self'],
        properties: { self: { type: 'boolean', enum: [true] } },
      },
    },
  },
  GeneralResponderVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'reporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['GENERAL_RESPONDER'] },
      reporter: {
        type: 'object',
        required: ['noReg', 'name', 'division', 'department'],
        properties: {
          noReg: { type: 'string' },
          name: { type: 'string' },
          division: { type: 'string' },
          department: { type: 'string' },
        },
      },
    },
  },
  LeadershipGeneralVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'reporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['LEADERSHIP_GENERAL_READ_ONLY'] },
      reporter: { type: 'object', additionalProperties: true },
    },
  },
  UnionAnonymousVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'anonymousReporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['UNION_ANONYMOUS'] },
      anonymousReporter: {
        type: 'object',
        required: ['alias'],
        properties: { alias: { type: 'string', example: 'Reporter Biru 47' } },
      },
    },
  },
  UnionIdentifiedVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'reporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['UNION_IDENTIFIED'] },
      reporter: {
        type: 'object',
        required: ['noReg', 'name', 'division', 'department'],
        properties: {
          noReg: { type: 'string' },
          name: { type: 'string' },
          division: { type: 'string' },
          department: { type: 'string' },
        },
      },
    },
  },
  AdminPrivateVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'reporter'],
    additionalProperties: false,
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY'] },
      reporter: {
        type: 'object',
        required: ['noReg', 'name', 'directorate', 'division', 'department', 'section', 'position'],
        additionalProperties: false,
        properties: {
          noReg: { type: 'string' },
          name: { type: 'string' },
          directorate: { type: 'string', nullable: true },
          division: { type: 'string' },
          department: { type: 'string' },
          section: { type: 'string', nullable: true },
          position: { type: 'string', nullable: true },
        },
      },
    },
  },
  LocationReviewSnapshot: {
    type: 'object',
    nullable: true,
    required: ['id', 'completeness', 'questions', 'contentHash'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      completeness: { type: 'string', enum: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'] },
      warning: { type: 'string', nullable: true },
      questions: { type: 'array', maxItems: 3, items: { type: 'string' } },
      contentHash: { type: 'string' },
    },
  },
  DashboardAggregate: {
    type: 'object',
    required: ['total', 'status', 'severity', 'category', 'trend', 'division', 'department'],
    properties: {
      total: { type: 'integer' },
      status: { $ref: '#/components/schemas/AggregateBuckets' },
      severity: { $ref: '#/components/schemas/AggregateBuckets' },
      category: { $ref: '#/components/schemas/AggregateBuckets' },
      trend: { $ref: '#/components/schemas/AggregateBuckets' },
      division: { $ref: '#/components/schemas/AggregateBuckets' },
      department: { $ref: '#/components/schemas/AggregateBuckets' },
    },
  },
  AggregateBuckets: {
    type: 'array',
    items: {
      type: 'object',
      required: ['label', 'value'],
      properties: { label: { type: 'string' }, value: { type: 'integer' } },
    },
  },
  ClosureCycleResponse: {
    type: 'object',
    required: ['id', 'cycleNumber', 'note', 'closedAt', 'actor', 'evidence', 'rating'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      cycleNumber: { type: 'integer' },
      note: { type: 'string' },
      closedAt: { type: 'string', format: 'date-time' },
      reopenedAt: { type: 'string', format: 'date-time', nullable: true },
      actor: {
        type: 'object',
        required: ['id', 'displayName'],
        properties: { id: { type: 'string', format: 'uuid' }, displayName: { type: 'string' } },
      },
      evidence: { type: 'array', items: { $ref: '#/components/schemas/AttachmentResponse' } },
      rating: {
        type: 'object',
        nullable: true,
        required: ['score', 'feedback', 'reopen', 'createdAt'],
        properties: {
          score: { type: 'integer', minimum: 1, maximum: 5 },
          feedback: { type: 'string', nullable: true },
          reopen: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  MemberDashboard: {
    type: 'object',
    required: ['total', 'counts', 'recent', 'draft', 'generatedAt'],
    additionalProperties: false,
    properties: {
      total: { type: 'integer' },
      counts: {
        type: 'object',
        required: ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'],
        additionalProperties: false,
        properties: {
          OPEN: { type: 'integer' },
          IN_VERIFICATION: { type: 'integer' },
          IN_PROGRESS: { type: 'integer' },
          CLOSED: { type: 'integer' },
        },
      },
      recent: { type: 'array', items: { $ref: '#/components/schemas/VoiceListItem' } },
      draft: {
        allOf: [{ $ref: '#/components/schemas/DraftListItem' }],
        nullable: true,
      },
      generatedAt: { type: 'string', format: 'date-time' },
    },
  },
  DraftListItem: {
    type: 'object',
    required: [
      'id',
      'visibility',
      'area',
      'locationDetail',
      'title',
      'detail',
      'version',
      'expiresAt',
      'updatedAt',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      visibility: baseVoiceProperties.visibility,
      area: baseVoiceProperties.area,
      locationDetail: { type: 'string' },
      title: { type: 'string' },
      detail: { type: 'string' },
      showReporterIdentity: { type: 'boolean', nullable: true },
      version: { type: 'integer', minimum: 1 },
      expiresAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  DraftListResponse: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/DraftListItem' } },
      nextCursor: { type: 'string', nullable: true, description: 'Signed opaque cursor' },
    },
  },
  OrganizationImportSummary: {
    type: 'object',
    required: [
      'rowCount',
      'unitCount',
      'create',
      'update',
      'deactivate',
      'unchanged',
      'routeGaps',
      'department14Rows',
      'globalPicInvalid',
      'unionGaps',
    ],
    additionalProperties: false,
    properties: {
      rowCount: { type: 'integer' },
      unitCount: { type: 'integer' },
      create: { type: 'integer' },
      update: { type: 'integer' },
      deactivate: { type: 'integer' },
      unchanged: { type: 'integer' },
      routeGaps: { type: 'array', items: { type: 'object', additionalProperties: true } },
      department14Rows: { type: 'integer' },
      globalPicInvalid: { type: 'boolean' },
      unionGaps: { type: 'array', items: { type: 'string' } },
    },
  },
  OrganizationImportPreview: {
    type: 'object',
    required: ['id', 'status', 'summary', 'checksum', 'version', 'expiresAt', 'createdAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      checksum: { type: 'string', description: 'SHA256 checksum of file' },
      version: { type: 'integer' },
      expiresAt: { type: 'string', format: 'date-time' },
      status: {
        type: 'string',
        enum: ['PREVIEWED', 'QUEUED', 'PROCESSING', 'CONFIRMED', 'FAILED', 'EXPIRED'],
      },
      summary: { $ref: '#/components/schemas/OrganizationImportSummary' },
      errors: { type: 'array', items: { type: 'object', additionalProperties: true } },
      createdAt: { type: 'string', format: 'date-time' },
      confirmedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  ConfirmImportRequest: {
    type: 'object',
    required: ['checksum', 'expectedVersion'],
    additionalProperties: false,
    properties: {
      checksum: {
        type: 'string',
        description: 'Must match batch.checksum else 409 CHECKSUM_MISMATCH',
      },
      expectedVersion: {
        type: 'integer',
        description: 'Must match batch.version else 409 VERSION_CONFLICT',
      },
    },
  },
  AccountStatusRequest: {
    type: 'object',
    required: ['status', 'reason', 'expectedVersion'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
      expectedVersion: { type: 'integer' },
    },
  },
  SuccessResponse: {
    type: 'object',
    required: ['success'],
    additionalProperties: false,
    properties: { success: { type: 'boolean' } },
  },
  AccountSummaryList: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/AccountSummary' } },
      nextCursor: { type: 'string', nullable: true, description: 'Signed opaque cursor' },
    },
  },
  AdminOverview: {
    type: 'object',
    required: ['accounts', 'openRemediation', 'latestImport', 'unionSlots', 'recentResolution'],
    additionalProperties: false,
    properties: {
      accounts: {
        type: 'object',
        required: ['active', 'legacy', 'inactive'],
        additionalProperties: false,
        properties: {
          active: { type: 'integer' },
          legacy: { type: 'integer' },
          inactive: { type: 'integer' },
        },
      },
      openRemediation: { type: 'integer' },
      latestImport: {
        type: 'object',
        nullable: true,
        required: ['id', 'status', 'createdAt'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      unionSlots: { type: 'integer' },
      recentResolution: {
        type: 'object',
        nullable: true,
        required: ['id', 'action', 'createdAt'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' },
          action: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  AccountSummary: {
    type: 'object',
    required: ['id', 'username', 'displayName', 'accountKind', 'status', 'version'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      displayName: { type: 'string' },
      accountKind: { type: 'string', enum: ['CARE_ADMIN', 'WORKFORCE', 'UNION'] },
      status: { type: 'string', enum: ['ACTIVE', 'LEGACY_HANDLER', 'INACTIVE'] },
      version: { type: 'integer', minimum: 1 },
      employee: {
        type: 'object',
        nullable: true,
        additionalProperties: false,
        required: ['noReg', 'name', 'memberships'],
        properties: {
          noReg: { type: 'string' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          memberships: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['structuralPosition', 'section', 'organizationUnit'],
              properties: {
                structuralPosition: { type: 'string' },
                section: { type: 'string', nullable: true },
                organizationUnit: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'directorate', 'division', 'department'],
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    directorate: { type: 'string' },
                    division: { type: 'string' },
                    department: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      unionTerms: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['slot'],
          properties: {
            slot: { type: 'string', enum: ['HEAD', 'OFFICER_1', 'OFFICER_2'] },
            effectiveFrom: { type: 'string', format: 'date-time' },
          },
        },
      },
      passwordChangeRequired: { type: 'boolean' },
      deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  AccountResetResponse: {
    type: 'object',
    required: ['id', 'username', 'temporaryPassword', 'passwordChangeRequired'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      temporaryPassword: { type: 'string' },
      passwordChangeRequired: { type: 'boolean' },
    },
  },
  RouteMappingResponse: {
    type: 'object',
    required: ['id', 'kind', 'ownerAccountId', 'effectiveFrom'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      kind: {
        type: 'string',
        enum: ['DEPARTMENT_HEAD', 'DEFAULT_DEPARTMENT', 'GLOBAL_SPECIAL', 'LEGACY'],
      },
      organizationUnitId: { type: 'string', format: 'uuid', nullable: true },
      ownerAccountId: { type: 'string', format: 'uuid' },
      effectiveFrom: { type: 'string', format: 'date-time' },
      effectiveTo: { type: 'string', format: 'date-time', nullable: true },
      reason: { type: 'string' },
    },
  },
  RemediationIssueList: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/RemediationIssue' } },
      nextCursor: { type: 'string', nullable: true },
    },
  },
  RemediationIssue: {
    type: 'object',
    required: ['id', 'type', 'status', 'details', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { type: 'string' },
      status: { type: 'string', enum: ['OPEN', 'RESOLVED', 'SUPERSEDED'] },
      organizationUnitId: { type: 'string', format: 'uuid', nullable: true },
      accountId: { type: 'string', format: 'uuid', nullable: true },
      details: { type: 'object', additionalProperties: true },
      createdAt: { type: 'string', format: 'date-time' },
      resolvedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  RemediationResolutionList: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'action', 'reason'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            reason: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            details: { type: 'object', additionalProperties: true },
          },
        },
      },
      nextCursor: { type: 'string', nullable: true },
    },
  },
  SectionHeadCandidateList: {
    type: 'array',
    items: {
      type: 'object',
      required: ['employeeName', 'section', 'structuralPosition', 'employee'],
      properties: {
        employeeName: { type: 'string' },
        section: { type: 'string' },
        structuralPosition: { type: 'string' },
        employee: {
          type: 'object',
          required: ['noReg', 'account'],
          properties: {
            noReg: { type: 'string' },
            account: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                username: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  UnionAccountList: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'slot', 'account'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        slot: { type: 'string', enum: ['HEAD', 'OFFICER_1', 'OFFICER_2'] },
        effectiveFrom: { type: 'string', format: 'date-time' },
        account: { $ref: '#/components/schemas/AccountSummary' },
      },
    },
  },
  UnionProvisionResponse: {
    type: 'object',
    required: ['slot', 'account', 'temporaryPassword', 'passwordChangeRequired'],
    properties: {
      slot: { type: 'string', enum: ['HEAD', 'OFFICER_1', 'OFFICER_2'] },
      account: { $ref: '#/components/schemas/AccountSummary' },
      temporaryPassword: { type: 'string', writeOnly: true },
      passwordChangeRequired: { type: 'boolean' },
    },
  },
  OrganizationChangeList: {
    type: 'object',
    required: ['id', 'items', 'nextCursor', 'total'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      items: { type: 'array', items: { $ref: '#/components/schemas/OrganizationChange' } },
      nextCursor: { type: 'string', nullable: true, description: 'Signed opaque cursor' },
      total: { type: 'integer', description: 'Total filtered changes' },
    },
  },
  OrganizationChange: {
    type: 'object',
    required: ['noReg', 'type'],
    properties: {
      noReg: { type: 'string' },
      type: { type: 'string', enum: ['CREATE', 'UPDATE', 'UNCHANGED', 'DEACTIVATE'] },
      positionChanged: { type: 'boolean' },
      organizationChanged: { type: 'boolean' },
      nameChanged: { type: 'boolean' },
    },
  },
  ImportQueuedResponse: {
    type: 'object',
    required: ['id', 'status'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['QUEUED'] },
    },
  },
  OrganizationImportList: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/OrganizationImportPreview' } },
      nextCursor: { type: 'string', nullable: true, description: 'Signed opaque cursor' },
    },
  },
  OrganizationSnapshot: {
    type: 'object',
    required: ['id', 'checksum', 'effectiveAt', 'rowCount', 'status'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      checksum: { type: 'string' },
      effectiveAt: { type: 'string', format: 'date-time' },
      rowCount: { type: 'integer' },
      status: { type: 'string', enum: ['ACTIVE', 'SUPERSEDED'] },
      unitCount: { type: 'integer' },
      memberCount: { type: 'integer' },
      headCount: { type: 'integer' },
      sourceSnapshotId: { type: 'string', format: 'uuid', nullable: true },
    },
  },
  OrganizationUnit: {
    type: 'object',
    required: [
      'id',
      'directorate',
      'division',
      'department',
      'compositeKey',
      'memberCount',
      'headCount',
      'routeHealth',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      directorate: { type: 'string' },
      division: { type: 'string' },
      department: { type: 'string' },
      compositeKey: { type: 'string' },
      memberCount: { type: 'integer' },
      headCount: { type: 'integer' },
      currentRouteOwnerId: { type: 'string', format: 'uuid', nullable: true },
      currentRouteOwner: { type: 'object', nullable: true, additionalProperties: true },
      routeHealth: { type: 'string', enum: ['HEALTHY', 'GAP'] },
      sourceSnapshotId: { type: 'string', format: 'uuid', nullable: true },
      isComposite: { type: 'boolean' },
    },
  },
  OrganizationUnitList: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/OrganizationUnit' } },
      nextCursor: { type: 'string', nullable: true },
    },
  },
  AuditEvent: {
    type: 'object',
    required: [
      'id',
      'action',
      'result',
      'resourceType',
      'occurredAt',
      'correlationId',
      'releaseSha',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      action: { type: 'string' },
      result: { type: 'string' },
      resourceType: { type: 'string' },
      resourceId: { type: 'string', nullable: true },
      actorAccountKind: { type: 'string', nullable: true },
      actorStructuralPosition: { type: 'string', nullable: true },
      occurredAt: { type: 'string', format: 'date-time' },
      correlationId: { type: 'string' },
      releaseSha: { type: 'string' },
      reason: { type: 'string', nullable: true },
      summary: { type: 'object', additionalProperties: true },
    },
  },
  AuditEventList: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/AuditEvent' } },
      nextCursor: { type: 'string', nullable: true },
    },
  },
  MetricsText: { type: 'string' },
  UpdatedCountResponse: {
    type: 'object',
    required: ['updated'],
    properties: { updated: { type: 'integer', minimum: 0 } },
  },
  UnreadCountResponse: {
    type: 'object',
    required: ['count'],
    properties: { count: { type: 'integer', minimum: 0 } },
  },
  PushPublicKeyResponse: {
    type: 'object',
    required: ['publicKey', 'configured'],
    properties: { publicKey: { type: 'string', nullable: true }, configured: { type: 'boolean' } },
  },
  PushStatusResponse: {
    type: 'object',
    required: ['configured', 'subscriptions'],
    properties: {
      configured: { type: 'boolean' },
      subscriptions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'installationId', 'environment'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            installationId: { type: 'string' },
            environment: { type: 'string' },
            lastSuccessAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
  },
  PushSubscriptionResponse: {
    type: 'object',
    required: ['id', 'active'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      active: { type: 'boolean' },
    },
  },
  NotificationPage: {
    type: 'object',
    required: ['items', 'nextCursor'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'type', 'title', 'body', 'readAt', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            deepLink: { type: 'string', nullable: true },
            readAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      nextCursor: { type: 'string', nullable: true },
    },
  },
  VoiceListItem: {
    type: 'object',
    required: ['id', 'displayId', 'visibility', 'area', 'title', 'severity', 'status', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      displayId: { type: 'string' },
      visibility: baseVoiceProperties.visibility,
      area: baseVoiceProperties.area,
      title: { type: 'string' },
      category: baseVoiceProperties.category,
      severity: baseVoiceProperties.severity,
      status: baseVoiceProperties.status,
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  VoiceListResponse: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/VoiceListItem' } },
      nextCursor: { type: 'string', nullable: true, description: 'Signed opaque cursor' },
    },
  },
  VoiceDraftResponse: {
    type: 'object',
    required: ['id', 'visibility', 'area', 'locationDetail', 'title', 'detail', 'version'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      visibility: baseVoiceProperties.visibility,
      area: baseVoiceProperties.area,
      locationDetail: { type: 'string' },
      title: { type: 'string' },
      detail: { type: 'string' },
      showReporterIdentity: { type: 'boolean', nullable: true },
      version: { type: 'integer', minimum: 1 },
      classificationContentHash: { type: 'string' },
      locationContentHash: { type: 'string' },
      classification: { $ref: '#/components/schemas/ClassificationPreview' },
      locationReview: { $ref: '#/components/schemas/LocationReviewSnapshot' },
      attachments: { type: 'array', items: { $ref: '#/components/schemas/AttachmentResponse' } },
    },
  },
  VoiceDraftPreview: {
    allOf: [
      { $ref: '#/components/schemas/VoiceDraftResponse' },
      {
        type: 'object',
        required: ['routeReadiness'],
        properties: {
          routeReadiness: {
            type: 'object',
            required: ['ready'],
            properties: {
              ready: { type: 'boolean' },
              reason: { type: 'string' },
              targetLabel: { type: 'string' },
              remediationCode: { type: 'string' },
            },
          },
          routeTarget: { type: 'string', nullable: true },
        },
      },
    ],
  },
  VoiceSubmittedResponse: {
    type: 'object',
    required: ['id', 'displayId', 'status'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      displayId: { type: 'string' },
      status: baseVoiceProperties.status,
    },
  },
  VoiceMutationResponse: {
    type: 'object',
    required: ['id', 'displayId', 'status', 'version'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      displayId: { type: 'string' },
      status: baseVoiceProperties.status,
      version: { type: 'integer', minimum: 1 },
      currentHandlerId: { type: 'string', format: 'uuid', nullable: true },
      handlerType: { type: 'string' },
    },
  },
  TimelineResponse: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'type', 'occurredAt', 'payload'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        type: { type: 'string' },
        occurredAt: { type: 'string', format: 'date-time' },
        payload: { type: 'object', additionalProperties: true },
      },
    },
  },
  AttachmentResponse: {
    type: 'object',
    required: ['id', 'purpose', 'mimeType', 'size', 'state', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      purpose: { type: 'string', enum: ['VOICE', 'CHAT', 'CLOSURE_EVIDENCE'] },
      mimeType: { type: 'string' },
      size: { type: 'integer' },
      state: { type: 'string' },
      width: { type: 'integer', nullable: true },
      height: { type: 'integer', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      readyAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  MessageResponse: {
    type: 'object',
    required: ['id', 'createdAt', 'senderAccountKind', 'sender', 'attachments'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      text: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      senderId: { type: 'string', format: 'uuid', nullable: true },
      senderAccountKind: { type: 'string' },
      sender: {
        type: 'object',
        required: ['kind'],
        properties: { kind: { type: 'string' }, alias: { type: 'string' } },
      },
      attachments: {
        type: 'array',
        items: { $ref: '#/components/schemas/AttachmentResponse' },
      },
    },
  },
  MessageList: { type: 'array', items: { $ref: '#/components/schemas/MessageResponse' } },
  ConversationList: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'voiceId'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        voiceId: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
        voice: { $ref: '#/components/schemas/VoiceListItem' },
        messages: { type: 'array', items: { $ref: '#/components/schemas/MessageResponse' } },
      },
    },
  },
  ClosureResponse: {
    type: 'object',
    required: ['id', 'voiceId', 'cycleNumber', 'note'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      voiceId: { type: 'string', format: 'uuid' },
      cycleNumber: { type: 'integer' },
      note: { type: 'string' },
    },
  },
  RatingResponse: {
    type: 'object',
    required: ['id', 'closureCycleId', 'score'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      closureCycleId: { type: 'string', format: 'uuid' },
      score: { type: 'integer' },
      feedback: { type: 'string', nullable: true },
      reopen: { type: 'boolean' },
    },
  },
  MediaBinary: { type: 'string', format: 'binary' },
};
