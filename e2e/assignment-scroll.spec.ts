import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

async function openAssignment(page: Page, count = 30) {
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
    voice: {
      id: 'voice-1',
      displayId: 'CARE-202608-000001',
      audience: 'GENERAL_RESPONDER',
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      status: 'OPEN',
      title: 'Perbaikan fasilitas',
      detail: 'Perbaikan fasilitas',
      availableActions: ['ASSIGN'],
    },
    assignmentCandidates: Array.from({ length: count }, (_, index) => ({
      id: `sh-${index + 1}`,
      displayName: `Section Head ${String(index + 1).padStart(2, '0')}`,
      activeCount: index % 5,
    })),
  });
  await page.goto('/voices/voice-1');
  await page.getByRole('button', { name: 'Tugaskan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tugaskan Penanggung' })).toBeVisible();
}

for (const [width, height] of [
  [360, 640],
  [390, 844],
  [768, 600],
  [1440, 800],
]) {
  test(`assignment scrolls 30 candidates with reachable footer at ${width}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await openAssignment(page);
    const dialog = page.getByRole('dialog');
    const body = dialog.locator('.care-dialog__body');
    const footer = dialog.locator('.care-dialog__footer');
    await expect(footer.getByRole('button', { name: 'Tugaskan' })).toBeInViewport();
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await body.hover();
    await page.mouse.wheel(0, 8000);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const last = dialog.getByRole('radio', { name: /Section Head 30/ });
    await expect(last).toBeInViewport();
    await last.click();
    await dialog
      .getByRole('textbox', { name: 'Alasan (opsional)' })
      .fill('Mohon lanjutkan penanganan.');
    await expect(footer.getByText('Section Head 30')).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Tugaskan' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const sent = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/assignments'),
    );
    await footer.getByRole('button', { name: 'Tugaskan' }).click();
    expect((await sent).postDataJSON()).toMatchObject({
      handlerAccountId: 'sh-30',
      reason: 'Mohon lanjutkan penanganan.',
      expectedVersion: 3,
    });
    await expect(dialog).not.toBeVisible();
  });
}

test('candidate search, no-match state, keyboard selection and focus return', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await openAssignment(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Cari penanggung' }).fill('missing');
  await expect(
    dialog.getByText('Tidak ada nama yang cocok. Coba kata pencarian lain.'),
  ).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Cari penanggung' }).fill('head 30');
  const candidate = dialog.getByRole('radio', { name: /Section Head 30/ });
  await candidate.focus();
  await page.keyboard.press('Space');
  await expect(candidate).toBeChecked();
  expect(
    (await new AxeBuilder({ page }).include('.assignment-dialog').analyze()).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tugaskan', exact: true })).toBeFocused();
});

test('candidate fetch failure offers retry instead of an empty list', async ({ page }) => {
  await openAssignment(page, 0);
  await page.keyboard.press('Escape');
  let failed = true;
  await page.route('**/assignment-candidates', (route) =>
    failed
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Coba lagi' }),
        })
      : route.fulfill({
          json: [{ id: 'sh-retry', displayName: 'Section Head Pulih', activeCount: 1 }],
        }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Tugaskan', exact: true }).click();
  await expect(page.getByText('Kandidat gagal dimuat')).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Section Head Pulih/ })).toBeVisible();
});
