import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

for (const width of [360, 390, 768, 1440]) {
  test(`respond with an opening message then set a calendar target at ${width}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/(respond|proceed)$/.test(new URL(request.url()).pathname)
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
        availableActions: ['RESPOND', 'ASSIGN', 'HANDOVER'],
      },
    });
    await page.goto('/voices/lifecycle-voice');
    expect(mutations).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Proses Voice', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Respons Voice' }).click();
    const dialog = page.getByRole('dialog', { name: 'Keterangan penanganan' });
    const submit = dialog.getByRole('button', { name: 'Respons & buka chat' });
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
    expect(mutations[0]?.body.text).toBe('Tim akan memeriksa lampu pada shift pagi.');
    await page.goto('/voices/lifecycle-voice');
    await expect(page.locator('[aria-current="step"]')).toHaveText('Direspons');
    await page.getByRole('button', { name: 'Proses Voice', exact: true }).click();
    const target = page.getByRole('dialog', { name: 'Mulai penanganan' });
    await expect(target.getByRole('button', { name: 'Mulai diproses' })).toBeDisabled();
    await target.getByRole('button', { name: 'Hari ini', exact: true }).click();
    await expect(target.locator('.target-preview')).toContainText('WIB');
    await target.getByRole('button', { name: 'Mulai diproses' }).click();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Diproses');
    await expect(page.getByRole('region', { name: 'Target penyelesaian' })).toContainText('WIB');
    expect(mutations.map((item) => item.path.split('/').at(-1))).toEqual(['respond', 'proceed']);
    expect(mutations[1]?.body.days).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('processing failure retains the target and retries with the same idempotency key', async ({
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
      status: 'RESPONDED',
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
  await dialog.getByRole('spinbutton', { name: 'Target penyelesaian (hari)' }).fill('3');
  await dialog.getByRole('button', { name: 'Mulai diproses' }).click();
  await expect(dialog.getByText('Target belum tersimpan')).toBeVisible();
  await expect(dialog.getByRole('spinbutton')).toHaveValue('3');
  await dialog.getByRole('button', { name: 'Mulai diproses' }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Diproses');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
});

test('reassign uses its own audited endpoint and retains the existing room', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'reassign-voice',
      displayId: 'CARE-202609-000093',
      visibility: 'GENERAL',
      status: 'RESPONDED',
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
  await expect(page).toHaveURL(/\/voices\/reassign-voice$/);
});

test('cancelling the assignment note leaves assignment and response untouched', async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/assignments'))
      mutations.push(request.url());
  });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
    voice: {
      id: 'cancel-assignment',
      displayId: 'CARE-202609-000099',
      visibility: 'GENERAL',
      status: 'OPEN',
      area: 'KARAWANG_1',
      title: 'Assignment',
      detail: 'Detail',
      availableActions: ['RESPOND', 'ASSIGN'],
    },
    assignmentCandidates: [{ id: 'section-1', displayName: 'Section Head Satu', activeCount: 0 }],
  });
  await page.goto('/voices/cancel-assignment');
  await page.getByRole('button', { name: 'Assign PIC', exact: true }).click();
  await page.getByRole('radio', { name: /Section Head Satu/ }).click();
  await page.getByRole('button', { name: 'Tugaskan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Keterangan penanganan' })).toBeVisible();
  expect(mutations).toHaveLength(0);
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Terbuka');
  expect(mutations).toHaveLength(0);
});

for (const width of [360, 768, 1440]) {
  test(`three chat participants expose full names and preserve failed drafts at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkforceApi(page, {
      voice: {
        id: 'three-chat',
        displayId: 'CARE-202609-000100',
        visibility: 'GENERAL',
        status: 'RESPONDED',
        area: 'KARAWANG_1',
        title: 'Percakapan penanganan',
        detail: 'Detail',
        availableActions: ['MESSAGE'],
        participants: [
          { id: 'reporter', displayName: 'Budi Santoso', role: 'REPORTER' },
          { id: 'owner', displayName: 'Muhammad Rizky Pratama', role: 'DEPARTMENT_HEAD' },
          { id: 'handler', displayName: 'Agus Setiawan', role: 'SECTION_HEAD' },
        ],
      },
    });
    await page.goto('/voices/three-chat/chat');
    await expect(page.locator('.chat-participant')).toHaveCount(3);
    await expect(page.locator('.chat-participants')).toContainText('Muhammad Ri…');
    await page.getByRole('button', { name: 'Lihat peserta percakapan' }).click();
    await expect(page.getByRole('dialog')).toContainText('Muhammad Rizky Pratama');
    await page.keyboard.press('Escape');
    await page.route('**/voices/three-chat/messages', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Coba lagi.' } })
        : route.fallback(),
    );
    await page.getByRole('textbox', { name: 'Pesan', exact: true }).fill('Draft tetap tersimpan');
    await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click();
    await expect(page.getByText('Pesan gagal dikirim')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Pesan', exact: true })).toHaveValue(
      'Draft tetap tersimpan',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
