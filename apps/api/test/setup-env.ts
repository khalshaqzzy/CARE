Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
  MEDIA_ROOT: './.tmp/test-media',
  RELEASE_SHA: 'ci',
  SESSION_HASH_SECRET: 'test-session-hash-secret-000000000000',
  SESSION_CSRF_SECRET: 'test-session-csrf-secret-000000000000',
  AUTH_THROTTLE_SECRET: 'test-auth-throttle-secret-00000000000',
  CURSOR_SIGNING_SECRET: 'test-cursor-signing-secret-0000000000',
  VERTEX_API_KEY: '',
  METRICS_TOKEN: 'test-metrics-token-0000000000000000',
  OUTBOX_ENABLED: 'true',
});
