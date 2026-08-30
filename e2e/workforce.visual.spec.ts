import { expect, test, type Page } from '@playwright/test';
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

// Baselines for the redesigned auth and Create Voice surfaces (ADR-0022).
// They share the workforce conventions above: 360px viewport, reduced motion,
// mocked contract, and the font-rasterization tolerance.

const screenshotOptions = {
  animations: 'disabled',
  threshold: 0.25,
  // Font rasterization differs between macOS (CoreText) and Linux CI
  // (FreeType); the same tolerance rationale as the other baselines.
  maxDiffPixelRatio: 0.06,
} as const;

const fallbackClassification = {
  source: 'MANUAL_FALLBACK',
  category: null,
  severity: null,
  confidence: 0.3,
  rationaleCode: 'LOW_CONFIDENCE',
  fallbackCode: 'BELOW_THRESHOLD',
};

/** Opens the wizard on the General detail step with the Ubah area sheet raised. */
async function openGeneralAreaSheet(page: Page) {
  await page.goto('/voices/new');
  await expect(page.getByRole('heading', { name: 'Mulai Voice baru' })).toBeVisible();
  await page.getByRole('radio', { name: /General Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('heading', { name: 'Detail Voice General' })).toBeVisible();
  await page.getByRole('button', { name: 'Pilih area temuan' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(450);
}

async function fillVoiceDetails(
  page: Page,
  content: {
    location: string;
    title: string;
    detail: string;
  },
) {
  await page.getByRole('textbox', { name: /Detail Lokasi/ }).fill(content.location);
  await page.getByRole('textbox', { name: /Judul Voice/ }).fill(content.title);
  await page.getByRole('textbox', { name: /Detail Voice/ }).fill(content.detail);
}

/** Interactions auto-scroll the page; baselines frame each step from the top. */
async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

test('workforce login visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { unauthenticated: true });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-login-360.png', screenshotOptions);
});

test('workforce password change visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: { ...memberSession(), passwordChangeRequired: true },
  });
  await page.goto('/change-password');
  await expect(page.getByRole('button', { name: 'Simpan password' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-password-change-360.png', screenshotOptions);
});

test('workforce create voice type visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await page.goto('/voices/new');
  await expect(page.getByRole('heading', { name: 'Mulai Voice baru' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-create-type-360.png', screenshotOptions);
});

test('workforce create area sheet visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await openGeneralAreaSheet(page);
  await expect(page).toHaveScreenshot('workforce-create-area-sheet-360.png', screenshotOptions);
});

test('workforce create general form visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await openGeneralAreaSheet(page);
  await page.getByRole('radio', { name: 'Karawang 1' }).click();
  await page.waitForTimeout(450);
  await fillVoiceDetails(page, {
    location: 'Lantai 3, dekat mesin produksi',
    title: 'Pencahayaan area produksi kurang',
    detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi kerja.',
  });
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-create-general-form-360.png', screenshotOptions);
});

test('workforce create processing visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await openGeneralAreaSheet(page);
  await page.getByRole('radio', { name: 'Karawang 1' }).click();
  await page.waitForTimeout(450);
  await fillVoiceDetails(page, {
    location: 'Lantai 3, dekat mesin produksi',
    title: 'Pencahayaan area produksi kurang',
    detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi kerja.',
  });
  // Hold classification and location review in flight so the staged
  // processing card renders its mid-analysis state deterministically.
  await page.route('**/api/v1/drafts/*/classify', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'AI',
        category: 'SAFETY',
        severity: 'HIGH',
        confidence: 0.9,
        rationaleCode: 'CLEAR_HAZARD',
      }),
    });
  });
  await page.route('**/api/v1/drafts/*/location-review', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'lr-1',
        completeness: 'COMPLETE',
        warning: null,
        questions: [],
        contentHash: 'c'.repeat(64),
      }),
    });
  });
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  await expect(page.getByText('Menganalisis Voice Anda')).toBeVisible();
  await page.waitForTimeout(300);
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-create-processing-360.png', screenshotOptions);
});

test('workforce create fallback visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { classification: fallbackClassification });
  await openGeneralAreaSheet(page);
  await page.getByRole('radio', { name: 'Karawang 1' }).click();
  await page.waitForTimeout(450);
  await fillVoiceDetails(page, {
    location: 'Lantai 3, dekat mesin produksi',
    title: 'Pencahayaan area produksi kurang',
    detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi kerja.',
  });
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  await expect(page.getByRole('heading', { name: 'Klasifikasi manual' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('radio', { name: /Keselamatan/ }).click();
  await page.getByRole('radio', { name: /^High/ }).click();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-create-fallback-360.png', screenshotOptions);
});

test('workforce create review general visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await openGeneralAreaSheet(page);
  await page.getByRole('radio', { name: 'Karawang 1' }).click();
  await page.waitForTimeout(450);
  await fillVoiceDetails(page, {
    location: 'Lantai 3, dekat mesin produksi',
    title: 'Pencahayaan area produksi kurang',
    detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi kerja.',
  });
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  await expect(page.getByRole('heading', { name: 'Tinjau sebelum kirim' })).toBeVisible({
    timeout: 15000,
  });
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-create-review-general-360.png', screenshotOptions);
});

test('workforce create private form visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await page.goto('/voices/new');
  await expect(page.getByRole('heading', { name: 'Mulai Voice baru' })).toBeVisible();
  await page.getByRole('radio', { name: /Private Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('heading', { name: 'Detail Voice Private' })).toBeVisible();
  await page.getByRole('button', { name: 'Pilih area temuan' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('radio', { name: 'Karawang 2' }).click();
  await page.waitForTimeout(450);
  await fillVoiceDetails(page, {
    location: 'Gedung A, ruang istirahat',
    title: 'Kursi istirahat rusak',
    detail: 'Sandaran kursi patah dan berisiko menyebabkan ketidaknyamanan.',
  });
  await page.getByRole('radio', { name: /Sembunyikan identitas/ }).click();
  await expect(page).toHaveScreenshot('workforce-create-private-form-360.png', screenshotOptions);
});

test('workforce create review private visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { classification: fallbackClassification });
  await page.goto('/voices/new');
  await expect(page.getByRole('heading', { name: 'Mulai Voice baru' })).toBeVisible();
  await page.getByRole('radio', { name: /Private Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('heading', { name: 'Detail Voice Private' })).toBeVisible();
  await page.getByRole('button', { name: 'Pilih area temuan' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('radio', { name: 'Karawang 2' }).click();
  await page.waitForTimeout(450);
  await fillVoiceDetails(page, {
    location: 'Gedung A, ruang istirahat',
    title: 'Kursi istirahat rusak',
    detail: 'Sandaran kursi patah dan berisiko menyebabkan ketidaknyamanan.',
  });
  await page.getByRole('radio', { name: /Sembunyikan identitas/ }).click();
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  await expect(page.getByRole('heading', { name: 'Klasifikasi manual' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('radio', { name: /^High/ }).click();
  await page.getByRole('button', { name: 'Simpan & Tinjau' }).click();
  await expect(page.getByRole('heading', { name: 'Tinjau sebelum kirim' })).toBeVisible({
    timeout: 15000,
  });
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-create-review-private-360.png', screenshotOptions);
});
