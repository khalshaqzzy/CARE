import { z } from 'zod';
import { loadLocalEnv } from './load-local-env';

loadLocalEnv();

const optionalSecret = z.string().min(24).optional().or(z.literal(''));
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  MEDIA_ROOT: z.string().min(1).default('./media'),
  RELEASE_SHA: z.string().min(1).default('development'),
  SESSION_COOKIE_NAME: z.string().min(1).default('care_session'),
  SESSION_HASH_SECRET: z.string().min(32),
  SESSION_CSRF_SECRET: z.string().min(32),
  AUTH_THROTTLE_SECRET: z.string().min(32),
  CURSOR_SIGNING_SECRET: z.string().min(32),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().positive().default(7),
  VERTEX_API_KEY: optionalSecret,
  VERTEX_MODEL: z.string().default('gemini-3.7-flash'),
  VERTEX_LOCATION: z.string().default('global'),
  VERTEX_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  VERTEX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  VAPID_SUBJECT: z.string().optional().or(z.literal('')),
  VAPID_PUBLIC_KEY: optionalSecret,
  VAPID_PRIVATE_KEY: optionalSecret,
  PUSH_ENDPOINT_HOSTS: z
    .string()
    .default('fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com'),
  METRICS_TOKEN: optionalSecret,
  OUTBOX_ENABLED: z.enum(['true', 'false']).default('true'),
});

type ParsedConfig = z.infer<typeof schema>;
export type AppConfig = Omit<ParsedConfig, 'OUTBOX_ENABLED' | 'PUSH_ENDPOINT_HOSTS'> & {
  OUTBOX_ENABLED: boolean;
  PUSH_ENDPOINT_HOSTS: string[];
};
let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid runtime configuration fields: ${fields}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV !== 'development' && value.NODE_ENV !== 'test') {
    for (const key of ['VERTEX_API_KEY', 'METRICS_TOKEN'] as const) {
      if (!value[key]) throw new Error(`Missing required runtime configuration field: ${key}`);
    }
  }
  if (value.NODE_ENV === 'production') {
    for (const key of ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const) {
      if (!value[key]) throw new Error(`Missing required runtime configuration field: ${key}`);
    }
  }
  cached = {
    ...value,
    OUTBOX_ENABLED: value.OUTBOX_ENABLED === 'true',
    PUSH_ENDPOINT_HOSTS: value.PUSH_ENDPOINT_HOSTS.split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  };
  return cached;
}

export function resetConfigForTests() {
  cached = undefined;
}

export function redactedConfig(config = loadConfig()) {
  return {
    environment: config.NODE_ENV,
    releaseSha: config.RELEASE_SHA,
    mediaRoot: config.MEDIA_ROOT,
    vertex: {
      configured: Boolean(config.VERTEX_API_KEY),
      model: config.VERTEX_MODEL,
      location: config.VERTEX_LOCATION,
    },
    push: { configured: Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) },
  };
}
