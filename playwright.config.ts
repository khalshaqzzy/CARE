import { defineConfig, devices } from '@playwright/test';

// The `fullstack` project and the API webServer are only added when
// FULLSTACK_E2E=1, so the default `test:frontend:e2e` run (which mocks the API
// via page routes) is unchanged. Enabling full-stack requires the API built
// (`pnpm build`) and, in CI, the Postgres service migrated and available.
const isFullStack = process.env.FULLSTACK_E2E === '1';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // The gated fullstack project mutates one shared disposable database across
  // several spec files; a single worker guarantees deterministic ordering.
  workers: isFullStack ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: [
    {
      command: 'pnpm --filter @care/web-voice preview --port 4173',
      url: 'http://127.0.0.1:4173/design',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @care/web-admin preview --port 4174',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
    },
    ...(isFullStack
      ? [
          {
            command: 'pnpm --filter @care/api start',
            url: 'http://127.0.0.1:3000/health',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]
      : []),
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(?:\.visual|pwa|fullstack|workforce-legacy|workforce-push)\.spec\.ts/,
    },
    {
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\.visual\.spec\.ts/,
    },
    {
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
      testMatch: /pwa\.spec\.ts/,
    },
    {
      name: 'push',
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
      testMatch: /workforce-push\.spec\.ts/,
    },
    {
      name: 'legacy-ios',
      use: {
        ...devices['iPhone 8'],
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 11_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.0 Mobile/15E148 Safari/604.1',
        serviceWorkers: 'block',
      },
      testMatch: /workforce-legacy\.spec\.ts/,
    },
    ...(isFullStack
      ? [
          {
            name: 'fullstack',
            use: { ...devices['Desktop Chrome'], serviceWorkers: 'block' },
            testMatch: /fullstack\.spec\.ts/,
            // A single serial journey that mutates shared DB state (forced
            // password, import confirm, reset); retries would replay with a
            // changed password, so disable them for this project.
            fullyParallel: false,
            retries: 0,
          },
        ]
      : []),
  ],
});
