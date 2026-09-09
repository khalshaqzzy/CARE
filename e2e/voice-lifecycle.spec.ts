import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

for (const width of [360, 390, 768, 1440]) {
  test(`monitor and process with a required opening message at ${width}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/(monitor|proceed)$/.test(new URL(request.url()).pathname)
      )
        mutations.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
    });
    await mockWorkforceApi(page, {
      session: memberSession({
        capabilities: ['MEMBER', 'MANAGER'],
        structuralPosition: 'Department Head',
      }),
      voice: {
        id: 'lifecycle-voice',
        displayId: 'CARE-202609-000090',
        visibility: 'GENERAL',
        status: 'OPEN',
        area: 'KARAWANG_1',
        title: 'Perbaikan penerangan',
        detail: 'Lampu di area kerja perlu diperbaiki.',
        availableActions: ['MONITOR', 'ASSIGN', 'HANDOVER'],
      },
    });
    await page.goto('/voices/lifecycle-voice');
    expect(mutations).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Proses Voice', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Monitor Voice' }).click();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Dimonitor');
    await expect(page.getByRole('button', { name: /Percakapan/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Proses Voice', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Mulai proses Voice' });
    const submit = dialog.getByRole('button', { name: 'Mulai proses & buka chat' });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Keterangan penanganan' }).fill('   ');
    await expect(submit).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'Keterangan penanganan' })
      .fill('Tim akan memeriksa lampu pada shift pagi.');
    await expect(submit).toBeInViewport();
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
    ).toEqual([]);
    await submit.click();
    await expect(page).toHaveURL(/\/voices\/lifecycle-voice\/chat$/);
    await expect(page.getByText('Tim akan memeriksa lampu pada shift pagi.')).toBeVisible();
    expect(mutations.map((item) => item.path.split('/').at(-1))).toEqual(['monitor', 'proceed']);
    expect(mutations[1]?.body.text).toBe('Tim akan memeriksa lampu pada shift pagi.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('processing failure retains the note and retries with the same idempotency key', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'retry-voice',
      displayId: 'CARE-202609-000092',
      visibility: 'GENERAL',
      status: 'MONITORED',
      area: 'KARAWANG_1',
      title: 'Retry process',
      detail: 'Detail',
      availableActions: ['PROCEED'],
    },
  });
  const keys: string[] = [];
  let attempt = 0;
  await page.route('**/api/v1/voices/retry-voice/proceed', async (route) => {
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (++attempt === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Layanan sementara tidak tersedia.' }),
      });
    return route.fallback();
  });
  await page.goto('/voices/retry-voice');
  await page.getByRole('button', { name: 'Proses Voice', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Keterangan penanganan' })
    .fill('Memeriksa ulang sambungan.');
  await dialog.getByRole('button', { name: 'Mulai proses & buka chat' }).click();
  await expect(dialog.getByText('Proses belum tersimpan')).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveValue('Memeriksa ulang sambungan.');
  await dialog.getByRole('button', { name: 'Mulai proses & buka chat' }).click();
  await expect(page).toHaveURL(/\/retry-voice\/chat$/);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
});

test('reassign uses its own audited endpoint and never starts chat', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'reassign-voice',
      displayId: 'CARE-202609-000093',
      visibility: 'GENERAL',
      status: 'MONITORED',
      area: 'KARAWANG_1',
      title: 'Assigned Voice',
      detail: 'Detail',
      availableActions: ['REASSIGN'],
    },
    assignmentCandidates: [{ id: 'section-1', displayName: 'Section Head Satu', activeCount: 1 }],
  });
  await page.goto('/voices/reassign-voice');
  await expect(page.getByRole('button', { name: 'Proses Voice', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ganti PIC' }).click();
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: /Section Head Satu/ })
    .click();
  const request = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/assignments/reassign'),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Tugaskan' }).click();
  expect((await request).postDataJSON()).toMatchObject({ handlerAccountId: 'section-1' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Percakapan/ })).toHaveCount(0);
});
