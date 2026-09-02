import { expect, test, type Page } from '@playwright/test';
import {
  baseVoiceItem,
  memberSession,
  mockWorkforceApi,
  PNG_MEDIA_SAMPLE,
  unionPrivateVoiceDetail,
  unionSession,
} from './helpers/mock-api';

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

const leadershipSession = memberSession({
  capabilities: ['MEMBER', 'DIVISION_LEADERSHIP'],
  structuralPosition: 'Division Head',
});

const unionHead = unionSession({ slot: 'HEAD' });

// Rich aggregate matching the concept numbers (42 total / 34 aktif / 3 kritis).
const managerDashboard = {
  total: 42,
  status: [
    { label: 'OPEN', value: 18 },
    { label: 'IN_VERIFICATION', value: 7 },
    { label: 'IN_PROGRESS', value: 9 },
    { label: 'CLOSED', value: 8 },
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
  division: [{ label: 'Manufacturing / Division A', value: 42 }],
  department: [
    { label: 'Manufacturing / Division A / Department A', value: 25 },
    { label: 'Manufacturing / Division A / Department B', value: 17 },
  ],
  area: [
    { label: 'KARAWANG_1', value: 18 },
    { label: 'KARAWANG_2', value: 14 },
    { label: 'SUNTER_1', value: 10 },
  ],
  areaCritical: [
    { label: 'KARAWANG_1', value: 3 },
    { label: 'KARAWANG_2', value: 0 },
  ],
  previousTotal: 39,
  // One OPEN unassigned item in workItemList keeps this stat coherent.
  pendingAssignment: 1,
  suppression: {
    enabled: false,
    threshold: 0,
    division: { suppressedBuckets: 0, suppressedValue: 0 },
    department: { suppressedBuckets: 0, suppressedValue: 0 },
  },
  filters: { area: null, category: null, severity: null, status: null, from: null, to: null },
  generatedAt: '2026-08-05T10:00:00.000Z',
};

// Two operational work items for inbox/list surfaces: one unassigned critical,
// one assigned high with a PIC label.
const workItemList = {
  items: [
    baseVoiceItem({
      ...voice,
      displayId: 'CARE-202608-000001',
      audience: 'GENERAL_RESPONDER',
      status: 'OPEN',
      severity: 'CRITICAL',
      title: 'Pencahayaan area produksi kurang',
      currentHandlerName: null,
      updatedAt: '2026-08-05T09:48:00.000Z',
    }),
    baseVoiceItem({
      ...voice,
      id: 'voice-2',
      displayId: 'CARE-202608-000007',
      audience: 'GENERAL_RESPONDER',
      status: 'IN_PROGRESS',
      severity: 'HIGH',
      area: 'KARAWANG_2',
      title: 'Ventilasi ruang kerja tidak optimal',
      currentHandlerName: 'Rina Marlina',
      updatedAt: '2026-08-04T15:20:00.000Z',
    }),
    baseVoiceItem({
      ...voice,
      id: 'voice-3',
      displayId: 'CARE-202608-000011',
      audience: 'GENERAL_RESPONDER',
      status: 'IN_VERIFICATION',
      severity: 'MEDIUM',
      area: 'SUNTER_1',
      title: 'Peralatan kerja perlu pemeriksaan',
      currentHandlerName: 'Budi Santoso',
      updatedAt: '2026-08-04T08:05:00.000Z',
    }),
  ],
  nextCursor: null,
};

const privateDashboard = {
  ...managerDashboard,
  total: 12,
  status: [
    { label: 'OPEN', value: 5 },
    { label: 'IN_VERIFICATION', value: 4 },
    { label: 'IN_PROGRESS', value: 3 },
  ],
  severity: [
    { label: 'CRITICAL', value: 1 },
    { label: 'HIGH', value: 4 },
    { label: 'MEDIUM', value: 5 },
    { label: 'LOW', value: 2 },
  ],
  department: [],
  area: [],
  areaCritical: [],
  previousTotal: undefined,
  pendingAssignment: 2,
};

const privateItemList = {
  items: [
    baseVoiceItem({
      ...voice,
      id: 'voice-p1',
      displayId: 'CARE-202608-000012',
      audience: 'UNION_ANONYMOUS',
      visibility: 'PRIVATE',
      status: 'OPEN',
      severity: 'CRITICAL',
      area: 'KARAWANG_2',
      title: 'Tekanan kerja dan perlakuan tidak adil',
      currentHandlerName: null,
      reporterAlias: 'Reporter Biru 47',
      updatedAt: '2026-08-05T09:48:00.000Z',
    }),
    baseVoiceItem({
      ...voice,
      id: 'voice-p2',
      displayId: 'CARE-202608-000013',
      audience: 'UNION_ANONYMOUS',
      visibility: 'PRIVATE',
      status: 'IN_VERIFICATION',
      severity: 'HIGH',
      area: 'SUNTER_1',
      title: 'Keluhan terkait kondisi kerja',
      currentHandlerName: 'Union Officer 1',
      reporterAlias: 'Reporter Biru 12',
      updatedAt: '2026-08-05T08:15:00.000Z',
    }),
  ],
  nextCursor: null,
};

test('workforce history visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    voice,
    voiceList: {
      items: [
        baseVoiceItem({
          ...voice,
          status: 'IN_VERIFICATION',
          severity: 'HIGH',
          updatedAt: '2026-08-03T10:00:00.000Z',
        }),
        baseVoiceItem({
          id: 'voice-10',
          displayId: 'CARE-202608-000010',
          audience: 'REPORTER_SELF',
          visibility: 'PRIVATE',
          status: 'IN_VERIFICATION',
          area: 'SUNTER_1',
          title: 'Kebocoran pipa di area utility',
          detail: 'Dedaunan mengendon di saluran.',
          availableActions: [],
          severity: 'HIGH',
          updatedAt: '2026-07-31T10:00:00.000Z',
        }),
        baseVoiceItem({
          id: 'voice-13',
          displayId: 'CARE-202608-000013',
          audience: 'REPORTER_SELF',
          visibility: 'GENERAL',
          status: 'CLOSED',
          area: 'KARAWANG_2',
          title: 'Ventilasi area gudang tidak optimal',
          detail: 'Udara stagnan di area simpan.',
          availableActions: [],
          severity: 'MEDIUM',
          updatedAt: '2026-08-01T10:00:00.000Z',
        }),
        baseVoiceItem({
          id: 'voice-8',
          displayId: 'CARE-202608-000008',
          audience: 'REPORTER_SELF',
          visibility: 'GENERAL',
          status: 'CLOSED',
          area: 'KARAWANG_3',
          title: 'Penataan material di area kerja',
          detail: 'Material menutupi jalur pejalan.',
          availableActions: [],
          severity: 'MEDIUM',
          updatedAt: '2026-07-27T10:00:00.000Z',
        }),
      ],
      nextCursor: null,
    },
  });
  // Pin the clock so relative "updated" timestamps are deterministic.
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-history-360.png', screenshotOptions);
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
    voiceList: workItemList,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ringkasan General Voice' })).toBeVisible();
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
    voiceList: workItemList,
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
  await page.goto('/voices/voice-1/chat');
  await expect(page.getByRole('heading', { name: 'Percakapan' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await expect(page).toHaveScreenshot('workforce-conversation-active-360.png', screenshotOptions);
});

// Baselines for the redesigned Voice detail (screens 13–14): an active voice
// framed from the top and a closed voice framed on the closure/rating card.

test('workforce detail active visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    voice: {
      ...voice,
      status: 'IN_VERIFICATION',
      conversationState: 'ACTIVE',
      attachments: [
        { id: 'att-1', mimeType: 'image/png' },
        { id: 'att-2', mimeType: 'image/png' },
      ],
    },
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-1');
  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await expect(page).toHaveScreenshot('workforce-detail-active-360.png', screenshotOptions);
});

test('workforce detail closed rating visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    voice: {
      ...voice,
      status: 'CLOSED',
      availableActions: ['RATE'],
      attachments: [
        { id: 'att-1', mimeType: 'image/png' },
        { id: 'att-2', mimeType: 'image/png' },
      ],
      closureCycles: [
        {
          id: 'cycle-1',
          cycleNumber: 1,
          note: 'Pelindung kabel diganti dan area diamankan.',
          closedAt: '2026-08-04T07:00:00.000Z',
          reopenedAt: null,
          reviewState: 'PENDING',
          reviewDeadline: '2026-08-06T07:00:00.000Z',
          reviewResolvedAt: null,
          evidence: [
            { id: 'evd-1', mimeType: 'image/png', purpose: 'CLOSURE_EVIDENCE' },
            { id: 'evd-2', mimeType: 'image/png', purpose: 'CLOSURE_EVIDENCE' },
          ],
          rating: null,
        },
      ],
    },
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-1');
  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  await expect(page.getByText('Bagaimana hasil tindak lanjutnya?')).toBeVisible();
  await page.locator('.closure-featured').evaluate((element) => {
    element.scrollIntoView();
  });
  await page.waitForTimeout(100);
  await expect(page).toHaveScreenshot('workforce-detail-closed-360.png', screenshotOptions);
});

// The auto-accepted variant: the review window expired unrated, so the rating
// card switches to the late-feedback notice with no countdown.
test('workforce detail closed auto-accepted visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    voice: {
      ...voice,
      status: 'CLOSED',
      availableActions: ['RATE'],
      attachments: [
        { id: 'att-1', mimeType: 'image/png' },
        { id: 'att-2', mimeType: 'image/png' },
      ],
      closureCycles: [
        {
          id: 'cycle-1',
          cycleNumber: 1,
          note: 'Pelindung kabel diganti dan area diamankan.',
          closedAt: '2026-08-01T07:00:00.000Z',
          reopenedAt: null,
          reviewState: 'ACCEPTED',
          reviewDeadline: '2026-08-03T07:00:00.000Z',
          reviewResolvedAt: '2026-08-03T07:00:00.000Z',
          evidence: [{ id: 'evd-1', mimeType: 'image/png', purpose: 'CLOSURE_EVIDENCE' }],
          rating: null,
        },
      ],
    },
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-1');
  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  await expect(page.getByText(/Voice diterima otomatis/)).toBeVisible();
  await page.locator('.closure-featured').evaluate((element) => {
    element.scrollIntoView();
  });
  await page.waitForTimeout(100);
  await expect(page).toHaveScreenshot('workforce-detail-closed-auto-accepted-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

// Baseline for the in-page attachment viewer (lightbox): opened from the
// first thumbnail of the detail attachments strip. The media stub serves the
// visible two-tone sample so the stage, chrome, and strip render deterministically.
test('workforce lightbox visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    voice: {
      ...voice,
      status: 'IN_VERIFICATION',
      conversationState: 'ACTIVE',
      attachments: [
        { id: 'att-1', mimeType: 'image/png' },
        { id: 'att-2', mimeType: 'image/png' },
        { id: 'att-3', mimeType: 'image/png' },
      ],
    },
    mediaBody: PNG_MEDIA_SAMPLE,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-1');
  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  await page.getByRole('button', { name: 'Lihat gambar 1 dari 3' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page).toHaveScreenshot('workforce-lightbox-360.png', screenshotOptions);
});

test('workforce union private inbox visual at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionHead,
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
    voiceList: privateItemList,
    privateDashboard,
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

// Baselines for the redesigned manager/leadership/union surfaces (screens
// 17–25). Each capture frames the surface from the top at 360px.

test('workforce manager home visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: managerSession,
    voice,
    generalDashboard: managerDashboard,
    voiceList: workItemList,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ringkasan General Voice' })).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-manager-home-360.png', screenshotOptions);
});

test('workforce Voice Member inbox visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: managerSession,
    voice,
    generalDashboard: managerDashboard,
    voiceList: workItemList,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/work-items');
  await expect(page.getByRole('heading', { name: 'Voice Member' })).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-voice-member-360.png', screenshotOptions);
});

test('workforce leadership home visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: leadershipSession,
    voice,
    generalDashboard: managerDashboard,
    voiceList: workItemList,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/');
  await expect(page.getByText('Leadership · Read-only')).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-leadership-home-360.png', screenshotOptions);
});

test('workforce union home visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionHead,
    voice: {
      id: 'voice-p1',
      displayId: 'CARE-202608-000002',
      audience: 'UNION_ANONYMOUS',
      visibility: 'PRIVATE',
      status: 'OPEN',
      area: 'KARAWANG_2',
      title: 'Tekanan kerja dan perlakuan tidak adil',
      detail: 'Deskripsi private.',
      availableActions: [],
      category: null,
    },
    voiceList: privateItemList,
    privateDashboard,
    generalDashboard: managerDashboard,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/');
  await expect(page.getByText('2 Private Voice menunggu penugasan')).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-union-home-360.png', screenshotOptions);
});

test('workforce union private inbox visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionHead,
    voice: {
      id: 'voice-p1',
      displayId: 'CARE-202608-000002',
      audience: 'UNION_ANONYMOUS',
      visibility: 'PRIVATE',
      status: 'OPEN',
      area: 'KARAWANG_2',
      title: 'Tekanan kerja dan perlakuan tidak adil',
      detail: 'Deskripsi private.',
      availableActions: [],
      category: null,
    },
    voiceList: privateItemList,
    privateDashboard,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/work-items');
  await expect(page.getByRole('heading', { name: 'Private Voice' })).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-union-private-inbox-360.png', screenshotOptions);
});

test('workforce union general overview visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionHead,
    voice: {
      id: 'voice-1',
      displayId: 'CARE-202608-000001',
      audience: 'LEADERSHIP_GENERAL_READ_ONLY',
      visibility: 'GENERAL',
      status: 'OPEN',
      area: 'KARAWANG_1',
      title: 'Pencahayaan area produksi kurang',
      detail: 'Lampu redup.',
      availableActions: [],
    },
    generalDashboard: managerDashboard,
    voiceList: workItemList,
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/general');
  await expect(page.getByRole('heading', { name: 'Tinjauan General' })).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-union-general-360.png', screenshotOptions);
});

test('workforce union identified detail visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionHead,
    voiceDetail: unionPrivateVoiceDetail({
      id: 'voice-p2',
      displayId: 'CARE-202608-000013',
      audience: 'UNION_IDENTIFIED',
      visibility: 'PRIVATE',
      status: 'IN_VERIFICATION',
      area: 'SUNTER_1',
      title: 'Keluhan terkait kondisi kerja',
      detail:
        'Suasana kerja di Gedung B sangat panas pada siang hari karena AC tidak berfungsi optimal.',
      availableActions: ['ASK', 'PROCEED', 'MESSAGE'],
      identified: true,
    }),
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-p2');
  // The name renders in both the hero chip and the reporter card.
  await expect(page.getByText('Sari Wulandari').first()).toBeVisible();
  await scrollToTop(page);
  await expect(page).toHaveScreenshot('workforce-union-identified-360.png', screenshotOptions);
});

test('workforce close sheet visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: managerSession,
    voice: {
      ...voice,
      status: 'IN_PROGRESS',
      availableActions: ['CLOSE'],
      conversationState: 'READ_ONLY',
    },
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-1');
  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page).toHaveScreenshot('workforce-close-sheet-360.png', screenshotOptions);
});

test('workforce assign sheet visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: unionHead,
    voiceDetail: unionPrivateVoiceDetail({
      id: 'voice-p1',
      displayId: 'CARE-202608-000012',
      audience: 'UNION_ANONYMOUS',
      visibility: 'PRIVATE',
      status: 'OPEN',
      area: 'KARAWANG_2',
      title: 'Tekanan kerja dan perlakuan tidak adil',
      detail: 'Deskripsi private.',
      availableActions: ['ASSIGN'],
      identified: false,
      alias: 'Reporter Biru 47',
    }),
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/voices/voice-p1');
  await expect(
    page.getByRole('heading', { name: 'Tekanan kerja dan perlakuan tidak adil' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tugaskan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page).toHaveScreenshot('workforce-assign-sheet-360.png', screenshotOptions);
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
  await page.getByRole('radio', { name: /Safety/ }).click();
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

for (const viewport of [
  { width: 360, height: 800 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 },
]) {
  test(`workforce handover selection visual at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockWorkforceApi(page, {
      session: managerSession,
      voice: {
        ...voice,
        displayId: 'CARE-202609-000007',
        status: 'OPEN',
        title: 'Bahaya kebakaran',
        availableActions: ['ASK', 'ASSIGN', 'HANDOVER', 'PROCEED'],
      },
      handoverOptions: {
        current: {
          category: { id: 'category-current', key: 'SAFETY', name: 'Safety' },
          department: {
            id: 'department-current',
            directorate: 'Manufacturing',
            division: 'Plant',
            department: 'Plant GA & SHE',
          },
          pic: {
            id: 'manager-current',
            displayName: 'Dedi Slamet Riyadi',
            type: 'DEPARTMENT_HEAD',
          },
        },
        options: [
          {
            category: { id: 'category-target', key: 'WORK_DIFFICULTY', name: 'Kesulitan Kerja' },
            routeMode: 'RELATED_REPORTER_DEPARTMENT',
            department: {
              id: 'department-target',
              directorate: 'Manufacturing',
              division: 'Production',
              department: 'Production Engineering',
            },
            pic: { id: 'manager-target', displayName: 'Yudo Ardiyanto', type: 'DEPARTMENT_HEAD' },
            isReporterDepartment: true,
            available: true,
            disabledReason: null,
          },
          {
            category: { id: 'category-gap', key: 'FACILITY', name: 'Fasilitas Umum' },
            routeMode: 'FIXED_DEPARTMENT',
            department: null,
            pic: null,
            isReporterDepartment: false,
            available: false,
            disabledReason: 'PIC department tujuan belum tersedia.',
          },
        ],
      },
    });
    await page.goto('/voices/voice-1/handover');
    await page.getByRole('radio', { name: /Kesulitan Kerja/ }).click();
    await page
      .getByRole('textbox', { name: /Detail handover/ })
      .fill('Mohon lanjutkan verifikasi kondisi pada department reporter.');
    await expect(page).toHaveScreenshot(`workforce-handover-${viewport.width}.png`, {
      fullPage: true,
      animations: 'disabled',
      threshold: 0.25,
      maxDiffPixelRatio: 0.06,
    });
  });
}
