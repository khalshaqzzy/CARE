import { expect, test, type Page } from '@playwright/test';
import { adminSession, mockAdminApi } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';

const divisionSession = {
  ...adminSession(),
  account: {
    id: 'division-admin-1',
    username: 'admin.prod1',
    displayName: 'Admin Produksi 1',
    accountKind: 'DIVISION_ADMIN' as const,
    status: 'ACTIVE' as const,
  },
  capabilities: ['DIVISION_ADMIN' as const],
  scopes: {
    overview: ['GENERAL_OWN_DIVISION' as const],
    detail: ['GENERAL_OWN_DIVISION' as const],
    action: [],
  },
};

const overview = {
  directorate: 'Manufacturing',
  division: 'Produksi 1',
  general: {
    total: 48,
    open: 6,
    responded: 9,
    inProgress: 12,
    closed: 21,
    overdue: 4,
    dueSoon: 3,
    critical: 2,
  },
  private: { total: 3, active: 1 },
  trend: [3, 5, 2, 6, 4, 8, 7, 5].map((count, index) => ({
    weekStart: new Date(Date.UTC(2026, 7, 24) + index * 7 * 86_400_000).toISOString().slice(0, 10),
    count,
  })),
  severity: { low: 9, medium: 22, high: 12, critical: 5 },
  destinations: [{ department: 'Assembly', count: 19 }],
  topReporters: [{ name: 'Andi Pratama', department: 'Assembly', count: 6 }],
  topResponders: [{ name: 'Budi Santoso', count: 11, closed: 8 }],
};

const voice = {
  id: '00000000-0000-4000-8000-000000000001',
  displayId: 'CARE-202610-000120',
  title: 'Kebocoran oli di line press 3',
  visibility: 'GENERAL',
  severity: 'CRITICAL',
  status: 'RESPONDED',
  currentHandlerName: 'Budi Santoso',
  updatedAt: '2026-10-15T01:15:00Z',
};

async function divisionAdmin(page: Page) {
  const voiceQueries: URLSearchParams[] = [];
  await mockAdminApi(page, { session: divisionSession as never });
  await page.route('**/api/v1/division-admin/overview', (route) =>
    route.fulfill({ json: overview }),
  );
  await page.route('**/api/v1/voices?**', (route) => {
    voiceQueries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { items: [voice], nextCursor: null } });
  });
  await page.route('**/api/v1/division-admin/export**', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="voice-Produksi-1-2026-10-16.xlsx"',
      },
      body: Buffer.from('xlsx'),
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  return voiceQueries;
}

test('Division Admin reads its division, filters from the tiles and downloads Excel', async ({
  page,
}) => {
  const voiceQueries = await divisionAdmin(page);
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(/\/voices$/);
  await expect(page.getByRole('heading', { name: 'Produksi 1' })).toBeVisible();
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('button', { name: 'Voice divisi' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Akun divisi' })).toBeVisible();
  await expect(nav.getByRole('button', { name: /Overview|Import|Audit/ })).toHaveCount(0);
  await expect(page.getByText('Private 3 (1 aktif)')).toBeVisible();
  await expect(page.getByText('Budi Santoso').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Visibility' })).toHaveCount(0);

  const responded = page.waitForRequest((request) => /status=RESPONDED/.test(request.url()));
  await page.getByRole('button', { name: /Direspon/ }).click();
  await responded;
  const overdue = page.waitForRequest((request) => /due=OVERDUE/.test(request.url()));
  await page.getByRole('button', { name: '4 terlambat' }).click();
  await overdue;
  await expect(page.getByRole('button', { name: '4 terlambat' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(voiceQueries.at(-1)?.get('due')).toBe('OVERDUE');

  const exportRequest = page.waitForRequest((request) =>
    request.url().includes('/division-admin/export'),
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh Excel' }).click();
  expect(new URL((await exportRequest).url()).searchParams.get('due')).toBe('OVERDUE');
  expect((await download).suggestedFilename()).toBe('voice-Produksi-1-2026-10-16.xlsx');

  await page.getByRole('button', { name: 'Sembunyikan ringkasan' }).click();
  await expect(page.getByText('Top responder')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tampilkan ringkasan' })).toBeVisible();

  await page.goto(`${ADMIN}/imports`);
  await expect(page).toHaveURL(/\/voices$/);
});

test('Division Admin sees its division accounts read-only', async ({ page }) => {
  await divisionAdmin(page);
  const accountRequests: string[] = [];
  await page.route('**/api/v1/division-admin/accounts?**', (route) => {
    accountRequests.push(route.request().url());
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.route('**/api/v1/division-admin/accounts/login-summary**', (route) =>
    route.fulfill({
      json: {
        division: 'Produksi 1',
        department: null,
        trackingSince: '2026-10-15T00:30:00Z',
        total: 412,
        loggedIn: 287,
        notLoggedIn: 125,
        groups: [
          { name: 'Assembly', total: 180, loggedIn: 151, notLoggedIn: 29 },
          { name: 'Painting', total: 232, loggedIn: 136, notLoggedIn: 96 },
        ],
      },
    }),
  );
  await page.goto(`${ADMIN}/accounts`);
  await expect(page.getByRole('heading', { name: 'Akun divisi' })).toBeVisible();
  await expect(page.getByLabel('Ringkasan login')).toContainText('412');
  await expect(page.getByRole('combobox', { name: 'Jenis akun' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Divisi' })).toHaveCount(0);
  await expect.poll(() => accountRequests.length).toBeGreaterThan(0);
  expect(accountRequests.every((url) => !url.includes('/admin/accounts'))).toBe(true);
});

test('CARE Admin creates a Division Admin account', async ({ page }) => {
  await mockAdminApi(page);
  let body: Record<string, unknown> | null = null;
  await page.route('**/api/v1/admin/division-admins', (route) => {
    if (route.request().method() === 'PUT') {
      body = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        json: {
          account: {
            id: 'a1',
            username: 'admin.eng',
            displayName: 'Admin Engineering',
            accountKind: 'DIVISION_ADMIN',
            status: 'ACTIVE',
            version: 1,
          },
          temporaryPassword: 'admin.eng',
          passwordChangeRequired: true,
        },
      });
    }
    return route.fulfill({
      json: [{ directorate: 'Manufacturing', division: 'Engineering', account: null }],
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${ADMIN}/division-admins`);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await page.getByLabel('Username').fill('admin.eng');
  await page.getByLabel('Alasan').fill('Admin divisi baru');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Akun dibuat')).toBeVisible();
  await expect
    .poll(() => body)
    .toEqual({
      directorate: 'Manufacturing',
      division: 'Engineering',
      username: 'admin.eng',
      displayName: 'Admin Engineering',
      reason: 'Admin divisi baru',
      expectedCurrentAccountId: null,
    });
});
