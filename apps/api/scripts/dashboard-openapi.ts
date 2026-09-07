const string = { type: 'string' };
const options = {
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'label'],
    properties: { id: string, label: string, parentId: { ...string, nullable: true } },
  },
};
const org = {
  type: 'object',
  required: ['directorate', 'division', 'department', 'section'],
  properties: { directorate: options, division: options, department: options, section: options },
};
const selected = {
  type: 'object',
  properties: { directorate: string, division: string, department: string, section: string },
};
const metadata = {
  basis: { type: 'string', enum: ['HANDLING', 'REPORTER'] },
  visibility: { type: 'string', enum: ['GENERAL', 'PRIVATE'] },
  level: { type: 'string', enum: ['division', 'department', 'section'] },
  allowedLevels: {
    type: 'array',
    items: { type: 'string', enum: ['division', 'department', 'section'] },
  },
  organization: org,
  selected,
  handlers: options,
  categories: options,
  scopeLabel: string,
};
const buckets = {
  type: 'array',
  items: {
    type: 'object',
    required: ['label', 'value'],
    properties: {
      id: string,
      label: string,
      value: { type: 'integer' },
      key: string,
      name: string,
    },
  },
};
export const dashboardParameters = [
  'basis',
  'visibility',
  'level',
  'directorate',
  'division',
  'department',
  'section',
  'handler',
  'area',
  'category',
  'severity',
  'status',
  'from',
  'to',
];
export const dashboardSchemas = {
  DashboardMetadata: {
    type: 'object',
    required: Object.keys(metadata),
    additionalProperties: false,
    properties: metadata,
  },
  DashboardView: {
    type: 'object',
    required: [
      ...Object.keys(metadata).filter((k) => k !== 'organization'),
      'total',
      'status',
      'severity',
      'category',
      'organization',
      'trend',
      'area',
      'previousTotal',
      'trendGrain',
      'protected',
      'suppressedDimensions',
      'suppression',
      'handlingUnresolved',
      'filters',
      'generatedAt',
    ],
    additionalProperties: false,
    properties: {
      ...metadata,
      organization: buckets,
      total: { type: 'integer', nullable: true },
      status: buckets,
      severity: buckets,
      category: buckets,
      trend: buckets,
      area: buckets,
      previousTotal: { type: 'integer', nullable: true },
      trendGrain: { type: 'string', enum: ['day', 'week', 'month'] },
      pendingAssignment: { type: 'integer' },
      protected: { type: 'boolean' },
      suppressedDimensions: { type: 'array', items: string },
      suppression: {
        type: 'object',
        required: ['enabled', 'threshold'],
        properties: { enabled: { type: 'boolean' }, threshold: { type: 'integer' } },
      },
      handlingUnresolved: { type: 'integer', nullable: true },
      filters: { type: 'object', additionalProperties: string },
      generatedAt: { type: 'string', format: 'date-time' },
    },
  },
};
