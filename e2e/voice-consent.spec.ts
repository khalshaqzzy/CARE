import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { memberSession, mockWorkforceApi, unionSession } from './helpers/mock-api';

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
  await expect(page.getByText('JPG, PNG, atau WebP · maksimum 10 MB per file.')).toBeVisible();
  // The privacy checklist gates analysis: contact consent is still missing.
  const analyze = page.getByRole('button', { name: 'Simpan & Analisis' });
  await expect(analyze).toBeDisabled();
  await expect(page.getByText(/Centang persetujuan pada bagian Identitas/)).toBeVisible();
  await page.getByRole('textbox', { name: /Judul Voice/ }).fill('Judul setelah perubahan');
  await page.getByRole('checkbox', { name: consent }).check();
  await expect(analyze).toBeEnabled();
  const request = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().endsWith('/drafts/draft-1'),
  );
  await analyze.click();
  expect((await request).postDataJSON()).toMatchObject({
    title: 'Judul setelah perubahan',
    privateContactConsent: true,
    expectedVersion: 1,
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
  // Private destinations always present as the committee label.
  await expect(
    page.locator('.review-summary__row').filter({ hasText: 'Rute tujuan' }),
  ).toContainText('Komite');
});

test('private analysis stays gated until the full privacy checklist is complete', async ({
  page,
}) => {
  await mockWorkforceApi(page, { draft: { ...draft, showReporterIdentity: null } });
  await page.goto('/drafts/draft-1/edit');
  const analyze = page.getByRole('button', { name: 'Simpan & Analisis' });
  await expect(analyze).toBeDisabled();
  await expect(page.getByText(/Centang persetujuan pada bagian Identitas/)).toBeVisible();
  await page.getByRole('radio', { name: /Sembunyikan identitas/ }).click();
  await expect(analyze).toBeDisabled();
  await page.getByRole('checkbox', { name: consent }).check();
  await expect(analyze).toBeEnabled();
  await expect(page.getByText(/Centang persetujuan pada bagian Identitas/)).toHaveCount(0);
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

test('workforce can defer a required password change for the current session', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: { ...memberSession(), passwordChangeRequired: true },
  });
  await page.goto('/change-password');
  const request = page.waitForRequest(
    (candidate) =>
      candidate.method() === 'POST' &&
      candidate.url().endsWith('/api/v1/auth/defer-password-change'),
  );
  await page.getByRole('button', { name: 'Lain kali' }).click();
  expect((await request).headers()['x-csrf-token']).toBe('csrf-token');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
});

test('failed password deferral stays on the form and remains retryable', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: { ...memberSession(), passwordChangeRequired: true },
    deferPasswordError: { status: 500, code: 'DEFER_FAILED' },
  });
  await page.goto('/change-password');
  await page.getByRole('button', { name: 'Lain kali' }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole('alert')).toContainText('Ganti password belum ditunda');
  await expect(page.getByRole('alert')).toContainText('Ganti password tidak dapat ditunda.');
  await expect(page.getByRole('button', { name: 'Lain kali' })).toBeEnabled();
});

for (const [code, message] of [
  ['CURRENT_PASSWORD_INVALID', 'Password saat ini tidak sesuai.'],
  ['PASSWORD_REUSE', 'Password baru tidak boleh sama dengan username atau password sebelumnya.'],
] as const) {
  test(`password edit failure ${code} shows its matching state`, async ({ page }) => {
    await mockWorkforceApi(page, {
      changePasswordError: { status: 400, code },
    });
    await page.goto('/change-password');
    await page.getByLabel('Password saat ini').fill('password-sekarang');
    await page.getByLabel(/^Password baru/).fill('password-baru');
    await page.getByLabel('Konfirmasi password baru').fill('password-baru');
    await page.getByRole('button', { name: 'Simpan password' }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('alert')).toContainText('Password belum diubah');
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('button', { name: 'Simpan password' })).toBeEnabled();
  });
}

test('Union cannot defer a required password change', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: { ...unionSession(), passwordChangeRequired: true },
  });
  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lain kali' })).toHaveCount(0);
});

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
  await page.getByRole('button', { name: 'Selesaikan Voice', exact: true }).click();
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
