import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { mockAdminApi } from './helpers/mock-api';

const account = (noReg: string, name: string, lastLoginAt: string | null) => ({
  id: `00000000-0000-4000-8000-${noReg.padStart(12, '0')}`,
  username: noReg,
  displayName: name,
  accountKind: 'WORKFORCE' as const,
  status: 'ACTIVE' as const,
  version: 1,
  passwordChangeRequired: !lastLoginAt,
  firstLoginAt: lastLoginAt,
  lastLoginAt,
  employee: {
    noReg,
    name,
    memberships: [
      {
        structuralPosition: 'Member',
        section: 'Assembly',
        organizationUnit: {
          id: '00000000-0000-4000-8000-00000000a001',
          directorate: 'Manufacturing',
          division: 'Divisi A',
          department: 'Produksi 1',
        },
      },
    ],
  },
  unionTerms: [],
});
const accounts = [
  account('000128', 'Andi Pratama', '2026-10-15T01:12:00Z'),
  account('000207', 'Citra Lestari', null),
];
const summary = (division: string | null, department: string | null) => ({
  division,
  department,
  trackingSince: '2026-10-15T00:30:00Z',
  total: 136,
  loggedIn: 96,
  notLoggedIn: 40,
  groups: department
    ? [{ name: 'Assembly', total: 136, loggedIn: 96, notLoggedIn: 40 }]
    : [
        { name: 'Produksi 1', total: 100, loggedIn: 80, notLoggedIn: 20 },
        { name: 'Quality Control', total: 36, loggedIn: 16, notLoggedIn: 20 },
      ],
});

test('Akun filters by division and login state and exports who has not logged in', async ({
  page,
}) => {
  const accountQueries: URLSearchParams[] = [];
  await mockAdminApi(page);
  await page.route('**/api/v1/admin/organization-units/filters/divisions**', (route) =>
    route.fulfill({ json: ['Divisi A', 'Divisi B'] }),
  );
  await page.route('**/api/v1/admin/accounts?**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    accountQueries.push(query);
    const loggedIn = query.get('loggedIn');
    const items = accounts.filter((item) =>
      loggedIn === 'false' ? !item.lastLoginAt : loggedIn === 'true' ? !!item.lastLoginAt : true,
    );
    return route.fulfill({ json: { items, nextCursor: null } });
  });
  await page.route('**/api/v1/admin/accounts/login-summary**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: summary(query.get('division'), query.get('department')) });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:4174/accounts');
  await expect(page.getByRole('columnheader', { name: 'Login terakhir' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Citra Lestari/ })).toContainText('Belum pernah');
  await expect(page.getByLabel('Ringkasan login')).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Divisi' }).click();
  await page.getByRole('option', { name: 'Divisi A', exact: true }).click();
  const card = page.getByLabel('Ringkasan login');
  await expect(card.getByRole('heading', { name: 'Login · Divisi A' })).toBeVisible();
  await expect(card).toContainText('136');
  await expect(card).toContainText('Sudah login · 71%');
  await expect.poll(() => accountQueries.at(-1)?.get('division')).toBe('Divisi A');

  const filtered = page.waitForRequest((request) =>
    /\/admin\/accounts\?.*loggedIn=false/.test(request.url()),
  );
  await card.getByRole('button', { name: /Belum login/ }).click();
  const query = new URL((await filtered).url()).searchParams;
  expect([query.get('loggedIn'), query.get('kind'), query.get('status')]).toEqual([
    'false',
    'WORKFORCE',
    'ACTIVE',
  ]);
  await expect(page.getByRole('row', { name: /Andi Pratama/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Login' })).toContainText('Belum login');

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Ekspor belum login' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('belum-login-Divisi-A.csv');
  const csv = await readFile((await file.path())!, 'utf8');
  expect(csv.replace(String.fromCharCode(0xfeff), '').split(String.fromCharCode(10))).toEqual([
    'noReg,nama,divisi,departemen,seksi,posisi',
    '"000207","Citra Lestari","Divisi A","Produksi 1","Assembly","Member"',
  ]);

  await card.getByRole('button', { name: /^Produksi 1:/ }).click();
  await expect(page).toHaveURL(/department=Produksi\+1/);
  await expect(page.getByRole('combobox', { name: 'Seksi' })).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Login · Produksi 1' })).toBeVisible();
});
