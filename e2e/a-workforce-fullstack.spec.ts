import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { PrismaClient as PrismaClientType } from '../apps/api/node_modules/@prisma/client';
const { PrismaClient } = createRequire(resolve('apps/api/package.json'))('@prisma/client') as {
  PrismaClient: new () => PrismaClientType;
};

const ORIGIN = 'http://127.0.0.1:4173';
const USERNAME = '000128';
const PASSWORD = '000128';
const NEW_PASSWORD = 'care-member-e2e-123';
const enabled = process.env.FULLSTACK_E2E === '1';

// The seeded member `000128` (Budi Santoso) starts with passwordChangeRequired.
// This smoke runs before the Admin full-stack journey (which later resets /
// deactivates the seeded workforce), so it starts from a fresh seed each run.
test.skip(
  !enabled,
  'Full-stack requires a running CARE API + seeded test DB (set FULLSTACK_E2E=1).',
);

test('member full-stack smoke: login, forced password, home and voice detail', async ({ page }) => {
  // The workforce bundle can take time to boot on a busy CI runner; give the
  // smoke room without loosening the assertion budgets.
  test.setTimeout(90_000);
  await page.goto(`${ORIGIN}/login`);
  await expect(page.getByRole('heading', { name: 'Silahkan login sesuai petunjuk.' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Username').fill(USERNAME);
  // Role + name — getByLabel('Password') would also match the PasswordInput
  // visibility toggle ("Tampilkan password"), and the label text is
  // "Password *" because of the required marker.
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();

  // A workforce account can defer for this session, but the account-level
  // requirement survives and is enforced again after the next login.
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await page.getByRole('button', { name: 'Lain kali' }).click();
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('banner').getByRole('button', { name: 'Keluar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Silahkan login sesuai petunjuk.' }),
  ).toBeVisible();
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await page.getByLabel('Password saat ini').fill(USERNAME);
  // The required new-password field's accessible name is "Password baru *"; anchor
  // the regex at the start so it does not also match "Konfirmasi password baru".
  await page.getByLabel(/^Password baru/).fill(NEW_PASSWORD);
  await page.getByLabel('Konfirmasi password baru').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Simpan password' }).click();

  // Member home loads real dashboard data from the seeded voices.
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Pencahayaan area produksi kurang')).toBeVisible({
    timeout: 10_000,
  });

  // Open the seeded General voice and read its detail/timeline from the API.
  await page.getByRole('button', { name: 'Buka CARE-202608-900001' }).click();
  await expect(
    page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
  ).toBeVisible();
  await expect(page.getByText('Timeline')).toBeVisible();
});

test('manager dashboard uses real hierarchy metadata and scoped aggregates', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${ORIGIN}/login`);
  await page.getByLabel('Username').fill('000003');
  await page.getByRole('textbox', { name: 'Password' }).fill('000003');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.getByRole('button', { name: 'Lain kali' }).click();
  await expect(page.locator('.dashboard-org-summary')).toContainText('Department A');
  await expect(
    page.locator('.dashboard-summary__metric').filter({ hasText: 'Total' }).locator('strong'),
  ).toHaveText('1');
  const db = new PrismaClient();
  const ids: string[] = [];
  try {
    const original = await db.voice.findUniqueOrThrow({
      where: { displayId: 'CARE-202608-900001' },
    });
    const sibling = await db.organizationUnit.findFirstOrThrow({
      where: { department: 'Department B' },
    });
    for (let i = 0; i < 16; i++) {
      const row = await db.voice.create({
        data: {
          ...original,
          id: crypto.randomUUID(),
          displayId: `CARE-202609-${910000 + i}`,
          anonymousAlias: `Dashboard-${i}`,
          ...(i < 11
            ? {}
            : {
                handlingOrganizationUnitId: sibling.id,
                handlingDirectorateSnapshot: sibling.directorate,
                handlingDivisionSnapshot: sibling.division,
                handlingDepartmentSnapshot: sibling.department,
                reporterOrganizationUnitId: sibling.id,
                reporterDirectorateSnapshot: sibling.directorate,
                reporterDivisionSnapshot: sibling.division,
                reporterDepartmentSnapshot: sibling.department,
              }),
        },
      });
      ids.push(row.id);
    }
    const total = page
      .locator('.dashboard-summary__metric')
      .filter({ hasText: 'Total' })
      .locator('strong');
    for (const basis of ['HANDLING', 'REPORTER']) {
      await page.goto(`/?basis=${basis}`);
      await expect(total).toHaveText('12');
      for (let round = 0; round < 2; round++) {
        await page.getByRole('button', { name: 'Department', exact: true }).click();
        await expect(total).toHaveText('17');
        await page.getByRole('button', { name: 'Section', exact: true }).click();
        await expect(total).toHaveText('12');
      }
      await page.reload();
      await expect(total).toHaveText('12');
      await page.goBack();
      await expect(total).toHaveText('17');
      await page.goForward();
      await expect(total).toHaveText('12');
    }
  } finally {
    await db.voice.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Department', exact: true }).click();
  await expect(page.locator('.dashboard-org-summary')).toContainText('Division A');
  await page.getByRole('button', { name: 'Pelaporan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pelaporan', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const aggregate = await page.request.get(`${ORIGIN}/api/v1/dashboard/general?basis=HANDLING`);
  expect(aggregate.ok()).toBe(true);
  const payload = await aggregate.json();
  expect(payload.total).toBe(1);
  expect(JSON.stringify(payload)).not.toContain('Pencahayaan area produksi kurang');
  const preview = await page.request.get(`${ORIGIN}/api/v1/dashboard/preview?basis=HANDLING`);
  expect((await preview.json()).items).toHaveLength(1);
  await page.locator('.dashboard-inbox').getByRole('button', { name: /Buka/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
  ).toBeVisible();
});

test('real lifecycle: monitor, process with opening note, close and reporter reopen', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const db = new PrismaClient();
  const managerContext = await browser.newContext();
  const reporterContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  const reporterPage = await reporterContext.newPage();
  let voiceId: string | undefined;
  try {
    const original = await db.voice.findUniqueOrThrow({
      where: { displayId: 'CARE-202608-900001' },
    });
    const created = await db.voice.create({
      data: {
        ...original,
        id: crypto.randomUUID(),
        displayId: 'CARE-202609-919999',
        title: 'Lifecycle fullstack',
        status: 'OPEN',
        version: 1,
        currentHandlerId: null,
      },
    });
    voiceId = created.id;
    const login = async (
      page: import('@playwright/test').Page,
      username: string,
      password: string,
    ) => {
      await page.goto(`${ORIGIN}/login`);
      await page.getByLabel('Username').fill(username);
      await page.getByRole('textbox', { name: 'Password' }).fill(password);
      await page.getByRole('button', { name: 'Masuk' }).click();
      await page.waitForURL((url) => url.pathname !== '/login');
      if (await page.getByRole('button', { name: 'Lain kali' }).isVisible())
        await page.getByRole('button', { name: 'Lain kali' }).click();
      await expect(page.getByRole('banner').getByRole('button', { name: 'Keluar' })).toBeVisible();
    };
    await login(managerPage, '000003', '000003');
    await managerPage.goto(`${ORIGIN}/voices/${voiceId}`);
    await managerPage.getByRole('button', { name: 'Monitor Voice' }).click();
    await expect(managerPage.locator('[aria-current="step"]')).toHaveText('Dimonitor');
    expect(
      await db.notification.count({
        where: { voiceId, recipientId: original.reporterId, title: 'Voice Anda sedang dimonitor' },
      }),
    ).toBe(1);
    await managerPage.getByRole('button', { name: 'Proses Voice', exact: true }).click();
    await managerPage
      .getByRole('textbox', { name: 'Keterangan penanganan' })
      .fill('PIC memeriksa kondisi langsung di lokasi.');
    await managerPage.getByRole('button', { name: 'Mulai proses & buka chat' }).click();
    await expect(managerPage).toHaveURL(new RegExp(`/voices/${voiceId}/chat$`));
    await expect(managerPage.getByText('PIC memeriksa kondisi langsung di lokasi.')).toBeVisible();
    expect(await db.message.count({ where: { conversation: { voiceId } } })).toBe(1);
    await managerPage.goto(`${ORIGIN}/voices/${voiceId}`);
    await managerPage.getByRole('button', { name: 'Selesaikan Voice' }).click();
    await managerPage
      .getByRole('textbox', { name: 'Catatan penyelesaian' })
      .fill('Pemeriksaan dan perbaikan selesai.');
    await managerPage.getByRole('dialog').getByRole('button', { name: 'Tutup Voice' }).click();
    await expect(managerPage.locator('[aria-current="step"]')).toHaveText('Selesai');
    await login(reporterPage, USERNAME, NEW_PASSWORD);
    await reporterPage.goto(`${ORIGIN}/voices/${voiceId}`);
    await reporterPage.getByRole('radio', { name: '2/5', exact: true }).click();
    await reporterPage
      .getByRole('textbox', { name: 'Tulis umpan balik' })
      .fill('Masih perlu pemeriksaan tambahan.');
    await reporterPage.getByRole('button', { name: 'Buka kembali', exact: true }).click();
    await expect(reporterPage.locator('[aria-current="step"]')).toHaveText('Diproses');
    await expect(reporterPage.locator('.voice-reopened').first()).toHaveText('Dibuka kembali');
    expect((await db.voice.findUniqueOrThrow({ where: { id: voiceId } })).status).toBe(
      'IN_PROGRESS',
    );
    expect(await db.message.count({ where: { conversation: { voiceId } } })).toBe(1);
  } finally {
    await managerContext.close();
    await reporterContext.close();
    if (voiceId) {
      await db.rating.deleteMany({ where: { closureCycle: { voiceId } } });
      await db.closureCycle.deleteMany({ where: { voiceId } });
      await db.message.deleteMany({ where: { conversation: { voiceId } } });
      await db.conversation.deleteMany({ where: { voiceId } });
      await db.notification.deleteMany({ where: { voiceId } });
      await db.voiceEvent.deleteMany({ where: { voiceId } });
      await db.voice.delete({ where: { id: voiceId } });
    }
    await db.$disconnect();
  }
});
