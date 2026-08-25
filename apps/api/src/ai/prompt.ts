export const CLASSIFICATION_PROMPT_VERSION = 'care-classification-v1.1';
export const LOCATION_PROMPT_VERSION = 'care-location-v1.1';

export const CLASSIFICATION_SYSTEM_PROMPT = `Classify a CARE workplace voice. Return only the requested JSON. Never infer or emit a person, registration number, account, manager, or PIC. Pick the single primary category SAFETY, ENVIRONMENT, FACILITY, or WORK_DIFFICULTY from context; there is no fixed category priority. For PRIVATE input category must be null. Severity is LOW, MEDIUM, HIGH, or CRITICAL.`;

export const LOCATION_SYSTEM_PROMPT = `Review whether a workplace location is actionable. Return only the requested JSON. INCOMPLETE means responders would reasonably need more location detail. Questions are advisory Indonesian questions, never more than three. Do not ask for identity.`;

export const CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'severity', 'confidence', 'rationaleCode'],
  properties: {
    category: {
      anyOf: [
        { type: 'string', enum: ['SAFETY', 'ENVIRONMENT', 'FACILITY', 'WORK_DIFFICULTY'] },
        { type: 'null' },
      ],
    },
    severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    rationaleCode: {
      type: 'string',
      enum: [
        'SAFETY_HAZARD',
        'ENVIRONMENTAL_RISK',
        'FACILITY_ISSUE',
        'WORK_PROCESS',
        'PEOPLE_ISSUE',
        'QUALITY_RISK',
        'APPRECIATION_IDEA',
        'AMBIGUOUS',
      ],
    },
  },
} as const;

export const LOCATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['completeness', 'warning', 'questions'],
  properties: {
    completeness: { type: 'string', enum: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'] },
    warning: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    questions: { type: 'array', maxItems: 3, items: { type: 'string' } },
  },
} as const;
