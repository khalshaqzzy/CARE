import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
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
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(?:\.visual|pwa)\.spec\.ts/,
    },
    { name: 'visual', use: { ...devices['Desktop Chrome'] }, testMatch: /\.visual\.spec\.ts/ },
    {
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
      testMatch: /pwa\.spec\.ts/,
    },
  ],
});
