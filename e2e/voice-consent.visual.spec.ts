import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

const draft = {
  id: 'draft-1',
  visibility: 'PRIVATE',
  area: 'KARAWANG_1',
  locationDetail: 'Gedung A, lantai 1',
  title: 'Kondisi tempat kerja',
  detail: 'Mohon tindak lanjut kondisi tempat kerja.',
  showReporterIdentity: false,
  privateContactConsent: null,
  version: 1,
  attachments: [],
  classification: {
    source: 'AI',
    category: null,
    severity: 'MEDIUM',
    confidence: 0.9,
    rationaleCode: 'CLEAR',
  },
  routeReadiness: { ready: true, targetLabel: 'Union Head' },
  routeTarget: 'Union Head',
};
const screenshot = { fullPage: true, animations: 'disabled' as const, maxDiffPixelRatio: 0.001 };

for (const width of [360, 768, 1440]) {
  test(`long confirmation visual ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkforceApi(page, {
      draftPreview: {
        ...draft,
        visibility: 'GENERAL',
        categoryNameSnapshot: 'Fasilitas Kerja dan Kesulitan Kerja di Area Produksi',
        classification: { ...draft.classification, category: 'WORK_DIFFICULTY' },
        routeTarget:
          'Department Head Manufacturing Production Engineering dan Pengembangan Fasilitas',
      },
    });
    await page.goto('/drafts/draft-1/preview');
    await expect(page.getByRole('heading', { name: 'Tinjau sebelum kirim' })).toBeVisible();
    await expect(page).toHaveScreenshot(`review-long-${width}.png`, screenshot);
  });
}
for (const accepted of [false, true]) {
  test(`private form consent ${accepted}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await mockWorkforceApi(page, { draft: { ...draft, privateContactConsent: accepted } });
    await page.goto('/drafts/draft-1/edit');
    await expect(page.getByRole('checkbox', { name: /Untuk menghindari fitnah/ })).toBeAttached();
    await expect(page).toHaveScreenshot(`private-consent-${accepted}-360.png`, screenshot);
  });
}
test('legacy preview missing consent', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await mockWorkforceApi(page, { draftPreview: draft });
  await page.goto('/drafts/draft-1/preview');
  await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeDisabled();
  await expect(page).toHaveScreenshot('private-legacy-preview-360.png', screenshot);
});
test('normal password change', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await mockWorkforceApi(page, {});
  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: 'Ganti password', exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('password-normal-360.png', screenshot);
});
for (const audience of ['GENERAL_RESPONDER', 'REPORTER_SELF']) {
  test(`detail identity ${audience}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
    await mockWorkforceApi(page, {
      session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
      voiceDetail:
        audience === 'GENERAL_RESPONDER'
          ? {
              id: 'voice-1',
              displayId: 'CARE-202608-000001',
              audience,
              visibility: 'GENERAL',
              status: 'OPEN',
              area: 'KARAWANG_1',
              title: 'Kondisi tempat kerja',
              detail: 'Mohon tindak lanjut.',
              locationDetail: 'Gedung A',
              severity: 'MEDIUM',
              availableActions: [],
              reporter: { name: 'Muhammad Budi Santoso Pratama Wicaksono', noReg: '000128' },
              currentHandler: { displayName: 'Manager PIC' },
            }
          : undefined,
      voice: {
        id: 'voice-1',
        displayId: 'CARE-202608-000001',
        audience,
        visibility: 'GENERAL',
        status: 'OPEN',
        area: 'KARAWANG_1',
        title: 'Kondisi tempat kerja',
        detail: 'Mohon tindak lanjut.',
        availableActions: [],
      },
    });
    await page.goto('/voices/voice-1');
    await expect(
      page.getByText(
        audience === 'GENERAL_RESPONDER'
          ? 'Pelapor: Muhammad Budi Santoso Pratama Wicaksono'
          : 'PIC: Manager PIC',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(`detail-identity-${audience}-360.png`, screenshot);
  });
}
