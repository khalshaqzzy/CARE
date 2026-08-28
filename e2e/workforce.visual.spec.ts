import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi, unionSession } from './helpers/mock-api';

const voice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'REPORTER_SELF',
  visibility: 'GENERAL' as const,
  status: 'IN_VERIFICATION',
  area: 'KARAWANG_1',
  title: 'Pencahayaan area produksi kurang',
  detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
  availableActions: [],
};

const managerSession = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Department Head',
});

const managerDashboard = {
  total: 42,
  status: [
    { label: 'OPEN', value: 8 },
    { label: 'IN_VERIFICATION', value: 7 },
    { label: 'IN_PROGRESS', value: 15 },
    { label: 'CLOSED', value: 12 },
  ],
  severity: [
    { label: 'CRITICAL', value: 3 },
    { label: 'HIGH', value: 11 },
    { label: 'MEDIUM', value: 18 },
    { label: 'LOW', value: 10 },
  ],
  category: [
    { label: 'SAFETY', value: 16 },
    { label: 'ENVIRONMENT', value: 9 },
    { label: 'FACILITY', value: 10 },
    { label: 'WORK_DIFFICULTY', value: 7 },
  ],
  trend: [
    { label: '2026-07-08', value: 4 },
    { label: '2026-07-15', value: 8 },
    { label: '2026-07-22', value: 6 },
    { label: '2026-07-29', value: 13 },
    { label: '2026-08-05', value: 11 },
  ],
  division: [{ label: 'Division A', value: 42 }],
  department: [
    { label: 'Department A', value: 25 },
    { label: 'Department B', value: 17 },
  ],
  suppression: {
    enabled: false,
    threshold: 0,
    division: { suppressedBuckets: 0, suppressedValue: 0 },
    department: { suppressedBuckets: 0, suppressedValue: 0 },
  },
  filters: { area: null, category: null, severity: null, status: null, from: null, to: null },
  generatedAt: '2026-08-05T10:00:00.000Z',
};

test('workforce history visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { voice });
  // Pin the clock so relative "updated" timestamps are deterministic.
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-history-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce notifications visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Pusat notifikasi' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-notifications-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce manager dashboard visual at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: managerSession,
    voice,
    generalDashboard: managerDashboard,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/');
  await expect(page.locator('.dashboard-overview')).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-manager-dashboard-1440.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce Voice Member workspace visual at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: managerSession,
    voice,
    generalDashboard: managerDashboard,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/work-items');
  await expect(page.getByRole('heading', { name: 'Voice Member' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-voice-member-1440.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce account visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Pengaturan akun' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-account-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce active conversation visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: managerSession,
    voice: {
      ...voice,
      availableActions: ['ASK', 'MESSAGE', 'PROCEED'],
      conversationState: 'ACTIVE',
    },
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-1');
  await expect(page.getByRole('heading', { name: 'Percakapan' })).toBeVisible();
  await page.locator('#voice-conversation').scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot('workforce-conversation-active-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce union private inbox visual at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionSession({ slot: 'HEAD' }),
    voice: {
      id: 'voice-p1',
      displayId: 'CARE-202608-000002',
      audience: 'UNION_ANONYMOUS',
      visibility: 'PRIVATE',
      status: 'OPEN',
      area: 'KARAWANG_2',
      title: 'Laporan papan nama rusak',
      detail: 'Papan nama area shift 3 tergantung satu baut saja.',
      availableActions: [],
      category: null,
    },
    privateDashboard: {
      total: 4,
      status: [
        { label: 'OPEN', value: 2 },
        { label: 'IN_PROGRESS', value: 2 },
      ],
      severity: [],
      category: [],
      trend: [],
      division: [],
      department: [],
      suppression: {
        enabled: false,
        threshold: 0,
        division: { suppressedBuckets: 0, suppressedValue: 0 },
        department: { suppressedBuckets: 0, suppressedValue: 0 },
      },
      filters: { area: null, category: null, severity: null, status: null, from: null, to: null },
      generatedAt: '2026-08-03T00:00:00.000Z',
      pendingAssignment: 2,
    },
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/work-items');
  await expect(page.getByRole('heading', { name: 'Private Voice' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-union-private-1440.png', {
    animations: 'disabled',
    threshold: 0.25,
    // Font rasterization differs between macOS (CoreText) and Linux CI
    // (FreeType); the same tolerance rationale as the other baselines.
    maxDiffPixelRatio: 0.06,
  });
});
