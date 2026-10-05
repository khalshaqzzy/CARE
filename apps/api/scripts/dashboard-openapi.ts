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
const organizationControls = {
  type: 'array',
  items: {
    type: 'object',
    required: ['name', 'visible', 'options'],
    properties: {
      name: { type: 'string', enum: ['directorate', 'division', 'department', 'section'] },
      visible: { type: 'boolean' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          required: ['value', 'label', 'query'],
          properties: {
            value: string,
            label: string,
            query: { type: 'object', additionalProperties: string },
          },
        },
      },
    },
  },
};
const performance = {
  type: 'object',
  additionalProperties: false,
  required: [
    'averageResponseSeconds',
    'responseSampleCount',
    'averageCompletionSeconds',
    'completionSampleCount',
    'averageFeedbackScore',
    'feedbackSampleCount',
  ],
  properties: {
    averageResponseSeconds: { type: 'number', nullable: true },
    responseSampleCount: { type: 'integer', minimum: 0 },
    averageCompletionSeconds: { type: 'number', nullable: true },
    completionSampleCount: { type: 'integer', minimum: 0 },
    averageFeedbackScore: { type: 'number', nullable: true },
    feedbackSampleCount: { type: 'integer', minimum: 0 },
  },
};
const metadata = {
  organizationControls,
  scopeMode: { type: 'string', enum: ['OWN', 'PARENT', 'GLOBAL'] },
  allowedScopeModes: {
    type: 'array',
    items: { type: 'string', enum: ['OWN', 'PARENT', 'GLOBAL'] },
  },
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
  'scopeMode',
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
const handler = {
  type: 'object',
  additionalProperties: false,
  required: [
    'accountId',
    'name',
    'role',
    'unitLabel',
    'held',
    'onTimeRate',
    'autoEscalated',
    'averageResponseSeconds',
    'overdue',
    'averageRating',
    'ratingCount',
  ],
  properties: {
    accountId: { type: 'string', format: 'uuid' },
    name: string,
    role: { type: 'string', enum: ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER'] },
    unitLabel: string,
    held: { type: 'integer', minimum: 0 },
    onTimeRate: { type: 'number', nullable: true },
    autoEscalated: { type: 'integer', minimum: 0 },
    averageResponseSeconds: { type: 'number', nullable: true },
    overdue: { type: 'integer', minimum: 0 },
    averageRating: { type: 'number', nullable: true },
    ratingCount: { type: 'integer', minimum: 0 },
  },
};
const member = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'unitLabel', 'voiceCount', 'lastSubmittedAt', 'activated'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: string,
    unitLabel: string,
    voiceCount: { type: 'integer', minimum: 0 },
    lastSubmittedAt: { type: 'string', format: 'date-time', nullable: true },
    activated: { type: 'boolean' },
  },
};
export const dashboardSchemas = {
  DashboardPreview: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'nextCursor', 'summary'],
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/VoiceListItem' } },
      nextCursor: { type: 'string', nullable: true },
      // Active Voices in view that need the viewer's action.
      summary: {
        type: 'object',
        additionalProperties: false,
        required: ['total', 'open', 'overdue', 'dueSoon', 'critical'],
        properties: {
          total: { type: 'integer', minimum: 0 },
          open: { type: 'integer', minimum: 0 },
          overdue: { type: 'integer', minimum: 0 },
          dueSoon: { type: 'integer', minimum: 0 },
          critical: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
  DashboardHandlers: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: { items: { type: 'array', items: handler } },
  },
  DashboardParticipation: {
    type: 'object',
    additionalProperties: false,
    required: ['memberCount', 'members'],
    properties: {
      memberCount: { type: 'integer', minimum: 0 },
      members: { type: 'array', items: member },
    },
  },
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
      'performance',
      'status',
      'severity',
      'category',
      'organization',
      'trend',
      'area',
      'previousTotal',
      'trendGrain',
      'handlingUnresolved',
      'filters',
      'generatedAt',
    ],
    additionalProperties: false,
    properties: {
      ...metadata,
      organization: buckets,
      performance,
      total: { type: 'integer' },
      status: buckets,
      severity: buckets,
      category: buckets,
      trend: buckets,
      area: buckets,
      previousTotal: { type: 'integer', nullable: true },
      trendGrain: { type: 'string', enum: ['day', 'week', 'month'] },
      pendingAssignment: { type: 'integer' },
      // Comparison window of the same length immediately before from/to; null without a range.
      previousPerformance: {
        type: 'object',
        nullable: true,
        additionalProperties: false,
        required: ['averageResponseSeconds', 'averageCompletionSeconds'],
        properties: {
          averageResponseSeconds: { type: 'number', nullable: true },
          averageCompletionSeconds: { type: 'number', nullable: true },
        },
      },
      // Voices of the cohort that entered each lifecycle state today (WIB).
      statusToday: buckets,
      // General only: answered or processed within the tier and target deadlines.
      onTime: {
        type: 'object',
        additionalProperties: false,
        required: ['onTime', 'total'],
        properties: {
          onTime: { type: 'integer', minimum: 0 },
          total: { type: 'integer', minimum: 0 },
        },
      },
      // General handling basis only: top reporter departments of the cohort.
      reporterOrigins: buckets,
      // General reporter basis only: team Voices still open past their deadline.
      teamOverdue: { type: 'integer', minimum: 0 },
      // Unit heads only: total of the other basis for the basis switcher.
      otherBasisTotal: { type: 'integer', nullable: true },
      handlingUnresolved: { type: 'integer', nullable: true },
      filters: { type: 'object', additionalProperties: string },
      generatedAt: { type: 'string', format: 'date-time' },
    },
  },
};
