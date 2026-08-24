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
      if (method !== 'get' && path !== '/api/v1/auth/login') {
        addHeader(operation, 'X-CSRF-Token', true, 'Session-bound CSRF token');
      }
      if (
        method !== 'get' &&
        (path.includes('/voices/') || path.endsWith('/submit')) &&
        !path.includes('attachments') &&
        !path.includes('closure-evidence')
      )
        addHeader(operation, 'Idempotency-Key', true, 'Unique key for safe mutation retries');
      const hasMultipart = operation.requestBody?.content?.['multipart/form-data'];
      if (method !== 'get' && method !== 'delete' && !operation.requestBody && !hasMultipart)
        operation.requestBody = {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/MutationRequest' } },
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
        if (status.startsWith('2') && !response.content)
          response.content = {
            'application/json': { schema: successSchema(operation.operationId) },
          };
      }
    }
  }
  return document;
}

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
        { $ref: '#/components/schemas/MemberVoiceDetail' },
        { $ref: '#/components/schemas/GeneralResponderVoiceDetail' },
        { $ref: '#/components/schemas/PrivateResponderVoiceDetail' },
        { $ref: '#/components/schemas/AdminPrivateVoiceDetail' },
      ],
      discriminator: {
        propertyName: 'audience',
        mapping: {
          MEMBER: '#/components/schemas/MemberVoiceDetail',
          GENERAL_RESPONDER: '#/components/schemas/GeneralResponderVoiceDetail',
          PRIVATE_RESPONDER: '#/components/schemas/PrivateResponderVoiceDetail',
          ADMIN_PRIVATE: '#/components/schemas/AdminPrivateVoiceDetail',
        },
      },
    };
  if (operationId === 'VoicesController_classify' || operationId === 'VoicesController_manual')
    return { $ref: '#/components/schemas/ClassificationPreview' };
  if (operationId === 'HealthController_health') return { $ref: '#/components/schemas/Health' };
  if (operationId === 'HealthController_ready') return { $ref: '#/components/schemas/Readiness' };
  if (operationId === 'HealthController_release') return { $ref: '#/components/schemas/Release' };
  if (operationId === 'AuthController_csrf') return { $ref: '#/components/schemas/CsrfToken' };
  if (operationId === 'AuthController_login' || operationId === 'AuthController_session')
    return { $ref: '#/components/schemas/SessionResponse' };
  if (operationId?.includes('_list')) return { $ref: '#/components/schemas/PagedResponse' };
  return { $ref: '#/components/schemas/SuccessResponse' };
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
  category: { type: 'string', nullable: true, enum: ['SAFETY', 'FACILITY', 'WORK_DIFFICULTY'] },
  severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  status: { type: 'string', enum: ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'] },
  version: { type: 'integer', minimum: 1 },
  pic: {
    type: 'object',
    required: ['label'],
    properties: { id: { type: 'string' }, label: { type: 'string' } },
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
  MutationRequest: {
    type: 'object',
    description: 'Endpoint-specific request. Aggregate mutations require expectedVersion.',
    properties: { expectedVersion: { type: 'integer', minimum: 1 } },
    additionalProperties: true,
  },
  SuccessResponse: { type: 'object', additionalProperties: true },
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
  Readiness: { type: 'object', additionalProperties: true },
  Release: {
    type: 'object',
    required: ['releaseSha', 'service'],
    properties: { releaseSha: { type: 'string' }, service: { type: 'string', enum: ['care-api'] } },
  },
  CsrfToken: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
  SessionResponse: {
    type: 'object',
    required: ['account', 'sessionId', 'passwordChangeRequired'],
    properties: {
      account: { type: 'object', additionalProperties: true },
      sessionId: { type: 'string', format: 'uuid' },
      passwordChangeRequired: { type: 'boolean' },
    },
  },
  ClassificationPreview: {
    type: 'object',
    required: ['source', 'category', 'severity', 'confidence', 'rationaleCode'],
    properties: {
      source: { type: 'string', enum: ['AI', 'MANUAL_FALLBACK'] },
      category: { type: 'string', enum: ['SAFETY', 'FACILITY', 'WORK_DIFFICULTY'] },
      severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      rationaleCode: { type: 'string' },
    },
  },
  MemberVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'reporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['MEMBER'] },
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
  PrivateResponderVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'anonymousReporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['PRIVATE_RESPONDER'] },
      anonymousReporter: {
        type: 'object',
        required: ['alias'],
        properties: { alias: { type: 'string', example: 'Reporter Biru 47' } },
      },
    },
  },
  AdminPrivateVoiceDetail: {
    type: 'object',
    required: [...Object.keys(baseVoiceProperties), 'anonymousReporter'],
    properties: {
      ...baseVoiceProperties,
      audience: { type: 'string', enum: ['ADMIN_PRIVATE'] },
      anonymousReporter: {
        type: 'object',
        required: ['alias'],
        properties: { alias: { type: 'string' } },
      },
    },
  },
};
