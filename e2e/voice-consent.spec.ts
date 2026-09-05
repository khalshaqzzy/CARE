import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

const consent = /Untuk menghindari fitnah/;
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

test('legacy private draft requires consent, persists edits and submits', async ({ page }) => {
  await mockWorkforceApi(page, { draft });
  await page.goto('/drafts/draft-1/edit');
  await expect(page.getByRole('checkbox', { name: consent })).not.toBeChecked();
  await expect(page.getByText('Foto harap mengikuti aturan ATSG ya teman-teman.')).toBeVisible();
  await page.getByRole('textbox', { name: /Judul Voice/ }).fill('Judul setelah perubahan');
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeDisabled();
  await page.getByRole('button', { name: 'Kembali', exact: true }).click();
  await page.getByRole('checkbox', { name: consent }).check();
  const request = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().endsWith('/drafts/draft-1'),
  );
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  expect((await request).postDataJSON()).toMatchObject({
    title: 'Judul setelah perubahan',
    privateContactConsent: true,
    expectedVersion: 2,
  });
  await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeEnabled();
  await page.getByRole('button', { name: 'Kirim Voice' }).click();
  await expect(page).toHaveURL(/\/voices\/submitted$/);
});

test('direct preview of legacy private draft cannot bypass consent', async ({ page }) => {
  await mockWorkforceApi(page, { draftPreview: draft });
  await page.goto('/drafts/draft-1/preview');
  await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeDisabled();
  await expect(page.getByText('Persetujuan komunikasi pribadi diperlukan')).toBeVisible();
});

test('changing visibility clears the contact checkbox', async ({ page }) => {
  await mockWorkforceApi(page, { draft });
  await page.goto('/drafts/draft-1/edit');
  await page.getByRole('checkbox', { name: consent }).check();
  await page.getByRole('button', { name: 'Kembali', exact: true }).click();
  await page.getByRole('radio', { name: /General Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('checkbox', { name: consent })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kembali', exact: true }).click();
  await page.getByRole('radio', { name: /Private Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('checkbox', { name: consent })).not.toBeChecked();
});

for (const forced of [false, true]) {
  test(`password back ${forced ? 'logs out restricted session' : 'returns to account'}`, async ({
    page,
  }) => {
    await mockWorkforceApi(page, {
      session: { ...memberSession(), passwordChangeRequired: forced },
    });
    await page.goto('/change-password');
    await page
      .getByRole('button', { name: forced ? 'Kembali ke login' : 'Kembali', exact: true })
      .click();
    await expect(page).toHaveURL(forced ? /\/login$/ : /\/account$/);
  });
}

for (const width of [360, 390, 768, 1440]) {
  test(`long review content fits and remains accessible at ${width}`, async ({ page }) => {
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
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page.locator('.review-summary').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(page.getByText('Sumber klasifikasi')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('closure needs a note but no photo', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
    voice: {
      id: 'voice-1',
      displayId: 'CARE-202608-000001',
      audience: 'GENERAL_RESPONDER',
      visibility: 'GENERAL',
      status: 'IN_PROGRESS',
      area: 'KARAWANG_1',
      title: 'Perbaikan fasilitas',
      detail: 'Perbaikan fasilitas',
      availableActions: ['CLOSE'],
    },
  });
  await page.goto('/voices/voice-1');
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Tutup Voice' })).toBeDisabled();
  await dialog
    .getByRole('textbox', { name: /Catatan penyelesaian/ })
    .fill('Perbaikan sudah selesai.');
  await expect(dialog.getByText('Tambahkan hingga 5 foto bila diperlukan.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Tutup Voice' })).toBeEnabled();
  const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/close'));
  await dialog.getByRole('button', { name: 'Tutup Voice' }).click();
  expect((await request).postDataJSON()).toMatchObject({ note: 'Perbaikan sudah selesai.' });
});

for (const audience of ['GENERAL_RESPONDER', 'REPORTER_SELF']) {
  test(`closed identity follows audience ${audience}`, async ({ page }) => {
    await mockWorkforceApi(page, {
      session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
      voice: {
        id: 'voice-1',
        displayId: 'CARE-202608-000001',
        audience,
        visibility: 'GENERAL',
        status: 'CLOSED',
        area: 'KARAWANG_1',
        title: 'Perbaikan fasilitas',
        detail: 'Perbaikan fasilitas',
        availableActions: [],
      },
    });
    await page.goto('/voices/voice-1');
    await expect(
      page
        .locator('.voice-hero')
        .getByText(
          audience === 'GENERAL_RESPONDER' ? 'Pelapor: Budi Santoso' : 'PIC: Manager PIC',
          { exact: true },
        ),
    ).toBeVisible();
  });
}
