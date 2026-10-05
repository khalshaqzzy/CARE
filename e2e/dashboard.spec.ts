import { dashboardFixture, orgKey } from './helpers/dashboard-fixture';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockWorkforceApi, memberSession, unionSession } from './helpers/mock-api';
const manager = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Department Head',
});
// Unit heads use the operations dashboard: status grid, organization chip, basis switcher.
const statusGrid = (page: Page) => page.locator('.ops-status').first();
const orgChip = (page: Page) =>
  page.getByRole('button', { name: 'Filter organisasi', exact: true });
const basisButton = (page: Page, label: 'Voice Untuk Saya' | 'Voice Tim Saya') =>
  page
    .getByRole('group', { name: 'Basis dashboard' })
    .getByRole('button', { name: new RegExp(`^${label}`) });
// The organization filter sets scope and level; there is no separate level toggle.
async function pickOrg(page: Page, label: string, option: string | number) {
  await orgChip(page).click();
  const dialog = page.getByRole('dialog', { name: 'Filter organisasi' });
  await dialog.getByRole('combobox', { name: label, exact: true }).click();
  const choice =
    typeof option === 'number'
      ? page.getByRole('option').nth(option)
      : page.getByRole('option', { name: option, exact: true });
  await choice.click();
  await dialog.getByRole('button', { name: 'Selesai', exact: true }).click();
}
const wider = (page: Page) => pickOrg(page, 'Department', 'Semua department');
const own = (page: Page) => pickOrg(page, 'Department', 'Production Control');
// Clearing filters lives in the "Filter lainnya" sheet; the head action refreshes data.
async function clearFilters(page: Page) {
  await page.getByRole('button', { name: /^Filter lainnya/ }).click();
  await page.getByRole('button', { name: 'Bersihkan filter', exact: true }).click();
  await page.getByRole('button', { name: 'Terapkan', exact: true }).click();
}
test('dashboard KPI, hierarchy, basis and browser history share one URL state', async ({
  page,
}) => {
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/');
  await expect(page.getByText('Lingkungan', { exact: true })).toBeVisible();
  await expect(page.getByText('Environment', { exact: true })).toHaveCount(0);
  const summary = statusGrid(page);
  await expect(summary.locator('.ops-status__tile')).toHaveCount(4);
  for (const [status, label, count] of [
    ['OPEN', 'Terbuka', '6'],
    ['RESPONDED', 'Direspon', '0'],
    ['IN_PROGRESS', 'Diproses', '3'],
    ['CLOSED', 'Selesai', '3'],
  ]) {
    const metric = summary.locator(`[data-status="${status}"]`);
    await expect(metric.locator('strong')).toHaveText(count);
    await expect(metric.locator('.ops-status__label')).toHaveText(label);
  }
  await expect(orgChip(page)).toContainText('Production Control');
  await wider(page);
  await expect(page).toHaveURL(/level=department/);
  await expect(orgChip(page)).toContainText('Production Division');
  await expect(basisButton(page, 'Voice Untuk Saya')).toHaveAttribute('aria-pressed', 'true');
  await basisButton(page, 'Voice Tim Saya').click();
  await expect(page).toHaveURL(/basis=REPORTER/);
  await expect(page).not.toHaveURL(/level=/);
  await page.goBack();
  await expect(page).toHaveURL(/level=department/);
  await page.reload();
  await expect(orgChip(page)).toContainText('Production Division');
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page).toHaveURL(/level=department/);
  await expect(orgChip(page)).toContainText('Production Division');
  await clearFilters(page);
  await expect(page).not.toHaveURL(/level=|basis=/);
  // The viewer's own Voices stay one tap away from the profile card.
  await expect(page.getByRole('button', { name: /^Voice saya/ })).toBeVisible();
});

test('Manager sees status counts, today and the total on the operations dashboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {
    session: manager,
    generalDashboard: {
      total: 14,
      otherBasisTotal: 9,
      status: [
        { label: 'OPEN', value: 2 },
        { label: 'RESPONDED', value: 3 },
        { label: 'IN_PROGRESS', value: 4 },
        { label: 'CLOSED', value: 5 },
      ],
      statusToday: [{ label: 'OPEN', value: 1 }],
    },
  });
  await page.goto('/');
  const card = page.locator('section[aria-labelledby="ops-status"]');
  await expect(card.getByRole('heading', { name: 'Status Voice', exact: true })).toBeVisible();
  await expect(card.locator('.ops-chip')).toHaveText('Total 14');
  await expect(statusGrid(page).locator('strong')).toHaveText(['2', '3', '4', '5']);
  await expect(statusGrid(page).locator('small')).toHaveText([
    '+1 hari ini',
    '+0 hari ini',
    '+0 hari ini',
    '+0 hari ini',
  ]);
  await expect(basisButton(page, 'Voice Untuk Saya')).toContainText('14');
  await expect(basisButton(page, 'Voice Tim Saya')).toContainText('9');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const [name, session] of [
  ['Director', memberSession({ capabilities: ['MEMBER', 'DIRECTOR'] })],
  ['Union Head', unionSession({ slot: 'HEAD' })],
] as const) {
  test(`${name} sees the Voice total and four compact status counts`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const dashboard = {
      total: 14,
      status: [
        { label: 'OPEN', value: 2 },
        { label: 'RESPONDED', value: 3 },
        { label: 'IN_PROGRESS', value: 4 },
        { label: 'CLOSED', value: 5 },
      ],
    };
    await mockWorkforceApi(page, {
      session,
      generalDashboard: dashboard,
      privateDashboard: dashboard,
    });
    await page.goto('/');
    const summary = page.locator('.dashboard-summary');
    const heading = summary.getByRole('heading', { name: 'Ringkasan Voice', exact: true });
    const total = summary.locator('.dashboard-summary__total');
    await expect(heading).toBeVisible();
    await expect(total).toHaveText('Total 14');
    const headingBox = (await heading.boundingBox())!;
    const totalBox = (await total.boundingBox())!;
    const headingMiddle = headingBox.y + headingBox.height / 2;
    expect(Math.abs(totalBox.y + totalBox.height / 2 - headingMiddle)).toBeLessThan(6);
    const metrics = summary.locator('.dashboard-summary__metric');
    await expect(metrics.locator('strong')).toHaveText(['2', '3', '4', '5']);
    await expect(metrics.locator('span')).toHaveText([
      'Terbuka',
      'Direspon',
      'Diproses',
      'Selesai',
    ]);
    await expect(page.getByRole('heading', { name: 'Distribusi status' })).toHaveCount(0);
    expect((await summary.boundingBox())!.height).toBeLessThan(190);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
test('Union tabs isolate filters and never expose reporter organization on Private', async ({
  page,
}) => {
  await mockWorkforceApi(page, { session: unionSession({ slot: 'OFFICER_1' }) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ringkasan Voice' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Basis dashboard' })).toHaveCount(0);
  await expect(page.getByLabel('PIC Union')).toHaveCount(0);
  await expect(page.getByText(/menunggu penugasan/)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Semua area' }).click();
  await page.getByRole('option', { name: 'Sunter 1', exact: true }).click();
  await expect(page).toHaveURL(/private.dashArea=SUNTER_1/);
  await page.getByRole('button', { name: 'General Voice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Filter dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Basis dashboard' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Semua area' })).toContainText('Semua area');
  await page
    .getByLabel('Jenis dashboard')
    .getByRole('button', { name: 'Private Voice', exact: true })
    .click();
  await expect(page.getByRole('combobox', { name: 'Semua area' })).toContainText('Sunter 1');
});
test('filters are keyboard accessible, show valid dates, and avoid overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/');
  await expect(statusGrid(page)).toBeVisible();
  const organization = orgChip(page);
  await organization.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Filter organisasi' });
  await expect(sheet.getByRole('combobox', { name: 'Department', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(organization).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Filter lainnya', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('combobox', { name: 'Rentang' }).click();
  await page.getByRole('option', { name: 'Pilih tanggal' }).click();
  await expect(page.getByText('Periksa rentang tanggal')).toBeVisible();
  await page.getByLabel('Dari tanggal').fill('2026-08-01');
  await page.getByLabel('Sampai tanggal').fill('2026-08-30');
  await expect(page.getByText('Periksa rentang tanggal')).toHaveCount(0);
  await expect(orgChip(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('repeated level switches keep one unassigned row, filter zero severity, and drop helper texts', async ({
  page,
}) => {
  await mockWorkforceApi(page, {
    session: manager,
    generalDashboard: {
      severity: [
        { label: 'HIGH', value: 5 },
        { label: 'MEDIUM', value: 10 },
      ],
      previousTotal: 0,
    },
  });
  await page.goto('/');
  for (let round = 0; round < 3; round++) {
    await wider(page);
    await expect(orgChip(page)).toContainText('Production Division');
    await own(page);
    await expect(orgChip(page)).toContainText('Production Control');
    const unassigned = page
      .locator('.ops-bars li')
      .filter({ hasText: 'Belum ditugaskan ke section' });
    await expect(unassigned).toHaveCount(1);
  }
  await page.goto('/?dashFrom=2026-08-01&dashTo=2026-08-30&range=custom');
  // Severity tiles always show all four levels, zeros included.
  const severity = page.locator('.ops-severity');
  await expect(severity.locator('strong')).toHaveText(['0', '5', '10', '0']);
  await expect(page.getByText('Belum ada Voice pada periode sebelumnya')).toHaveCount(0);
  await expect(page.getByText('Perbandingan periode belum tersedia')).toHaveCount(0);
  await expect(page.getByText('Tren menghitung Voice yang disubmit')).toHaveCount(0);
  await expect(page.getByText('Hanya Voice yang boleh Anda buka')).toHaveCount(0);
});

for (const basis of ['HANDLING', 'REPORTER']) {
  test(`restores 12 → 17 → 12 for ${basis}, including reload and navigation`, async ({ page }) => {
    await mockWorkforceApi(page, { session: manager });
    await page.goto(`/?basis=${basis}`);
    const total = statusGrid(page);
    await expect(total).toHaveAttribute('data-total', '12');
    const status = page.locator('section[aria-labelledby="ops-status"]');
    const initial = await status.innerText();
    for (let i = 0; i < 3; i++) {
      await wider(page);
      await expect(total).toHaveAttribute('data-total', '17');
      await expect(page).toHaveURL(/scopeMode=PARENT/);
      await own(page);
      await expect(total).toHaveAttribute('data-total', '12');
      await expect(status).toHaveText(initial, { useInnerText: true });
      await expect(page).toHaveURL(/scopeMode=OWN/);
    }
    await page.reload();
    await expect(total).toHaveAttribute('data-total', '12');
    await page.goBack();
    await expect(total).toHaveAttribute('data-total', '17');
    await page.goForward();
    await expect(total).toHaveAttribute('data-total', '12');
    await clearFilters(page);
    await expect(total).toHaveAttribute('data-total', '12');
  });
}
for (const [name, session] of [
  ['Director', memberSession({ capabilities: ['MEMBER', 'DIRECTOR'] })],
  ['Union Head', unionSession({ slot: 'HEAD' })],
] as const) {
  test(`${name} sees one all-Voice dashboard without a basis choice`, async ({ page }) => {
    const bases: (string | null)[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/v1/dashboard/general') bases.push(url.searchParams.get('basis'));
    });
    await mockWorkforceApi(page, { session });
    await page.goto('/?dashboardTab=general&basis=REPORTER');
    await expect(page.getByRole('heading', { name: 'Ringkasan Voice' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Basis dashboard' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Voice Tim Saya' })).toHaveCount(0);
    await expect.poll(() => bases.length).toBeGreaterThan(0);
    expect(bases.every((basis) => basis === 'HANDLING')).toBe(true);
  });
}
test('Refresh reloads the dashboard without clearing filters', async ({ page }) => {
  // Metadata is not polled (30 s stale time), so a new request proves the manual refresh.
  let metadataRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/dashboard/metadata') metadataRequests++;
  });
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/?dashArea=SUNTER_1&basis=REPORTER');
  await expect(statusGrid(page)).toBeVisible();
  await expect.poll(() => metadataRequests).toBeGreaterThan(0);
  const before = metadataRequests;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => metadataRequests).toBeGreaterThan(before);
  await expect(page).toHaveURL(/dashArea=SUNTER_1/);
  await expect(page).toHaveURL(/basis=REPORTER/);
  await expect(basisButton(page, 'Voice Tim Saya')).toHaveAttribute('aria-pressed', 'true');
});
test('Section Head can switch between own section and department overview', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'SECTION_HEAD'],
      structuralPosition: 'Section Head',
    }),
  });
  await page.goto('/');
  const total = statusGrid(page);
  await expect(total).toHaveAttribute('data-total', '8');
  await pickOrg(page, 'Section', 0);
  await expect(total).toHaveAttribute('data-total', '12');
  await pickOrg(page, 'Section', 1);
  await expect(total).toHaveAttribute('data-total', '8');
});
test('relative range refresh shares timestamps between aggregate and preview', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-30T03:00:00Z') });
  const bounds: Record<string, string[]> = { general: [], preview: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    const kind = url.pathname.split('/').at(-1)!;
    if (url.pathname.includes('/dashboard/') && bounds[kind])
      bounds[kind]!.push(url.searchParams.get('to')!);
  });
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/?range=30d');
  await expect(statusGrid(page)).toBeVisible();
  await page.clock.runFor(3500);
  await expect.poll(() => bounds.general!.length).toBeGreaterThan(1);
  await expect.poll(() => bounds.preview!.length).toBe(bounds.general!.length);
  expect(bounds.general).toEqual(bounds.preview);
  expect(Date.parse(bounds.general!.at(-1)!)).toBeGreaterThan(Date.parse(bounds.general![0]!));
});

test('a delayed wider response cannot replace the restored own scope', async ({ page }) => {
  await mockWorkforceApi(page, { session: manager });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let finished!: () => void;
  const completed = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await page.route('**/api/v1/dashboard/general?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('scopeMode') !== 'PARENT') return route.fallback();
    requested();
    await gate;
    try {
      await route.fulfill({ json: dashboardFixture(manager, url).view });
    } finally {
      finished();
    }
  });
  await page.goto('/');
  const total = statusGrid(page);
  await expect(total).toHaveAttribute('data-total', '12');
  await wider(page);
  await started;
  await page.goBack();
  await expect(total).toHaveAttribute('data-total', '12');
  release();
  await completed;
  await expect(total).toHaveAttribute('data-total', '12');
});
test('preview failure does not hide a successful aggregate', async ({ page }) => {
  await mockWorkforceApi(page, { session: manager });
  await page.route('**/api/v1/dashboard/preview?**', (route) =>
    route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'Unavailable' } }),
  );
  await page.goto('/');
  await expect(statusGrid(page)).toHaveAttribute('data-total', '12');
  await expect(page.getByText('Ringkasan belum tersedia.')).toBeVisible();
  await expect(page.getByText('Dashboard gagal dimuat')).toHaveCount(0);
});

test('legacy General browse handles invalid calendar dates without fetching a broader range', async ({
  page,
}) => {
  const reads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/dashboard/general') reads.push(request.url());
  });
  await mockWorkforceApi(page, { session: unionSession({ slot: 'HEAD' }) });
  await page.goto('/general?range=custom&dashFrom=2026-02-30&dashTo=2026-03-01');
  await expect(page.getByText('Periksa rentang tanggal')).toBeVisible();
  expect(reads).toEqual([]);
});

test('refreshes selector metadata when a master update changes the default department', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-30T03:00:00Z') });
  await mockWorkforceApi(page, { session: manager });
  let moved = false;
  let metadataReads = 0;
  await page.route('**/api/v1/dashboard/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['/api/v1/dashboard/metadata', '/api/v1/dashboard/general'].includes(url.pathname))
      return route.fallback();
    const fixture = dashboardFixture(manager, url);
    if (moved) {
      const id = orgKey('Production', 'Production Division', 'New Department');
      fixture.metadata.selected.department = id;
      fixture.metadata.scopeLabel = 'New Department';
      fixture.metadata.organization.department = [
        { id, label: 'New Department', parentId: orgKey('Production', 'Production Division') },
      ];
      fixture.metadata.organization.section = [];
      fixture.metadata.organizationControls = fixture.metadata.organizationControls.map(
        (control) =>
          control.name === 'department'
            ? {
                ...control,
                options: control.options.map((option) =>
                  option.value
                    ? {
                        value: id,
                        label: 'New Department',
                        query: { scopeMode: 'OWN', level: 'section', department: id },
                      }
                    : option,
                ),
              }
            : control.name === 'section'
              ? { ...control, visible: false }
              : control,
      );
      fixture.view.organizationControls = fixture.metadata.organizationControls;
      fixture.view.selected = { ...fixture.metadata.selected };
      fixture.view.scopeLabel = 'New Department';
    }
    const metadata = url.pathname.endsWith('/metadata');
    if (metadata) metadataReads++;
    return route.fulfill({ json: metadata ? fixture.metadata : fixture.view });
  });
  await page.goto('/');
  await expect(orgChip(page)).toContainText('Production Control');
  expect(metadataReads).toBe(1);
  moved = true;
  await page.clock.runFor(3500);
  await expect(orgChip(page)).toContainText('New Department');
  await expect.poll(() => metadataReads).toBe(2);
  await orgChip(page).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Filter organisasi' })
      .getByRole('combobox', { name: 'Department', exact: true }),
  ).toContainText('New Department');
});

test('speed card follows server scope targets and the range uses all time by default', async ({
  page,
}) => {
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Rentang', exact: true })).toContainText(
    'Semua waktu',
  );
  const speed = page.locator('section[aria-labelledby="ops-speed"]');
  await expect(speed).toContainText('4.0');
  await expect(speed).toContainText('jam');
  await expect(speed).toContainText('7.0');
  await expect(speed).toContainText('3.5');
  // Without a comparison window there is no comparison line.
  await expect(speed.locator('.ops-compare')).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: 'Filter organisasi' });
  await orgChip(page).click();
  await expect(dialog.getByRole('combobox', { name: 'Direktorat', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Division', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).click();
  await page.getByRole('option', { name: 'Semua department', exact: true }).click();
  await expect(page).toHaveURL(/scopeMode=PARENT/);
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).click();
  await page.getByRole('option', { name: 'Production Control', exact: true }).click();
  await expect(page).toHaveURL(/scopeMode=OWN/);
  await dialog.getByRole('button', { name: 'Selesai', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rentang', exact: true }).click();
  await expect(page.getByRole('option', { name: '30 hari', exact: true })).toBeVisible();
  await page.getByRole('option', { name: '30 hari', exact: true }).click();
  await expect(page).toHaveURL(/range=30d/);
  await clearFilters(page);
  await expect(page.getByRole('combobox', { name: 'Rentang', exact: true })).toContainText(
    'Semua waktu',
  );
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(speed).toContainText('7.0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('Group Leader gets the section-scoped responder dashboard and Voice Member', async ({
  page,
}) => {
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'GROUP_LEADER'],
      structuralPosition: 'Group Leader',
    }),
  });
  await page.goto('/');
  await expect(statusGrid(page)).toBeVisible();
  await expect(basisButton(page, 'Voice Untuk Saya')).toHaveAttribute('aria-pressed', 'true');
  await expect(basisButton(page, 'Voice Tim Saya')).toBeVisible();
  await expect(page.getByText('Voice Member', { exact: true }).first()).toBeAttached();
  // Group Leaders do not get the people cards.
  await expect(page.getByRole('heading', { name: 'Performa Responder' })).toHaveCount(0);
  await basisButton(page, 'Voice Tim Saya').click();
  await expect(page.getByRole('heading', { name: 'Sebaran Voice Tim' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Partisipasi Anggota' })).toHaveCount(0);
});

const handlers = {
  items: [
    ['Andi Pratama', 'SECTION_HEAD', 'Assembly 1', 14, 0.93, 0],
    ['Rina Kusuma', 'SECTION_HEAD', 'Welding', 11, 0.64, 3],
    ['Siti Rahma', 'GROUP_LEADER', 'Assembly 1 · Line A', 12, 0.92, 0],
    ['Dedi Saputra', 'GROUP_LEADER', 'Welding · Line B', 9, 0.56, 4],
  ].map(([name, role, unitLabel, held, onTimeRate, autoEscalated], index) => ({
    accountId: `00000000-0000-4000-8000-00000000010${index}`,
    name,
    role,
    unitLabel,
    held,
    onTimeRate,
    autoEscalated,
    averageResponseSeconds: 1800 * (index + 1),
    overdue: 0,
    averageRating: 4.5,
    ratingCount: 3,
  })),
};
const participation = {
  memberCount: 4,
  members: [
    ['Agus Santoso', 7, true],
    ['Budi Wibowo', 2, true],
    ['Citra Putri', 0, true],
    ['Dewi Hartono', 0, false],
  ].map(([name, voiceCount, activated], index) => ({
    id: `00000000-0000-4000-8000-00000000020${index}`,
    name,
    unitLabel: 'Assembly 1 · Line A',
    voiceCount,
    lastSubmittedAt: voiceCount ? '2026-08-28T03:00:00.000Z' : null,
    activated,
  })),
};
test('Manager sees responder performance with tabs and the Top label', async ({ page }) => {
  await mockWorkforceApi(page, { session: manager, dashboardHandlers: handlers });
  await page.goto('/');
  const card = page.locator('section[aria-labelledby="ops-responders"]');
  await expect(card.getByRole('heading', { name: 'Performa Responder' })).toBeVisible();
  const roles = card.getByRole('group', { name: 'Peran responder' });
  await expect(roles.getByRole('button', { name: /^Section Head/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const rows = card.locator('.ops-person');
  await expect(rows.first()).toContainText('Andi Pratama');
  await expect(rows.first()).toContainText('Top');
  await expect(rows.nth(1)).toContainText('Naik otomatis');
  await roles.getByRole('button', { name: /^Group Leader/ }).click();
  await expect(rows.first()).toContainText('Siti Rahma');
  await expect(rows).toHaveCount(2);
  expect((await new AxeBuilder({ page }).include('.ops').analyze()).violations).toEqual([]);
});
test('the full responder list separates every person in its own box', async ({ page }) => {
  const many = {
    items: ['Andi', 'Bayu', 'Citra', 'Dewi', 'Eko'].map((name, index) => ({
      ...handlers.items[0]!,
      accountId: `00000000-0000-4000-8000-00000000030${index}`,
      name: `${name} Section`,
    })),
  };
  await mockWorkforceApi(page, { session: manager, dashboardHandlers: many });
  await page.goto('/');
  await page.getByRole('button', { name: 'Lihat semua Section Head (5)' }).click();
  const sheet = page.getByRole('dialog', { name: 'Performa Responder' });
  const rows = sheet.locator('.ops-person');
  await expect(rows).toHaveCount(5);
  // The sheet renders outside the board, so it must carry the board's tokens.
  for (const style of await rows.evaluateAll((items) =>
    items.map((item) => {
      const row = getComputedStyle(item);
      const avatar = getComputedStyle(item.querySelector('.ops-avatar')!);
      return [row.borderTopWidth, row.borderTopStyle, avatar.backgroundColor];
    }),
  ))
    expect(style).toEqual(['1px', 'solid', 'rgb(15, 23, 42)']);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
});
test('Voice Tim Saya shows participation, top contributor and members who never sent', async ({
  page,
}) => {
  await mockWorkforceApi(page, { session: manager, dashboardParticipation: participation });
  await page.goto('/?basis=REPORTER');
  const summary = page.locator('section[aria-labelledby="ops-participation"]');
  await expect(summary).toContainText('50% aktif');
  await expect(summary).toContainText('4');
  const activity = page.locator('section[aria-labelledby="ops-members"]');
  await expect(activity.locator('.ops-person').first()).toContainText('Agus Santoso');
  await expect(activity.locator('.ops-person').first()).toContainText('Top Contributor');
  await activity.getByRole('button', { name: /^Belum kirim/ }).click();
  await expect(activity).toContainText('1 belum aktivasi');
  await expect(activity.locator('.ops-person').first()).toContainText('Dewi Hartono');
  await expect(activity.locator('.ops-person').first()).toContainText('Belum aktivasi');
});
const actionItem = (
  id: string,
  title: string,
  hours: number | null,
  severity: string,
  status = 'OPEN',
) => ({
  id,
  displayId: `CARE-${id.slice(-3)}`,
  visibility: 'GENERAL',
  area: 'KARAWANG_1',
  title,
  category: 'SAFETY',
  categoryNameSnapshot: 'Safety',
  severity,
  status,
  updatedAt: new Date().toISOString(),
  tierDueAt: hours === null ? null : new Date(Date.now() + hours * 3_600_000).toISOString(),
  reporterName: 'Irwan Setiawan',
  reporterDepartment: 'Production Control',
});
const actionList = {
  items: [
    actionItem(
      '00000000-0000-4000-8000-000000000301',
      'Sensor cold storage berbunyi',
      1,
      'CRITICAL',
    ),
    actionItem('00000000-0000-4000-8000-000000000302', 'Lampu jalur forklift redup', -3, 'MEDIUM'),
  ],
  nextCursor: null,
};
const actionSummary = { total: 5, open: 2, overdue: 1, dueSoon: 1, critical: 1 };
test('Butuh Tindakan Saya sums up first and each count opens Voice Member', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: manager,
    voiceList: actionList,
    dashboardSummary: actionSummary,
  });
  await page.goto('/?dashArea=SUNTER_1');
  const card = page.locator('section[aria-labelledby="ops-actions"]');
  await expect(card.getByRole('heading', { name: 'Butuh Tindakan Saya' })).toBeVisible();
  await expect(card.locator('.ops-chip')).toHaveText('5 Voice');
  // The summary sits above Status Voice.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('#ops-actions, #ops-status')].map((el) => el.id),
  );
  expect(order).toEqual(['ops-actions', 'ops-status']);
  await expect(card.locator('.ops-actions__tile strong')).toHaveText(['1', '1', '2', '1']);
  await expect(card.locator('.ops-actions__next')).toContainText('Lampu jalur forklift redup');
  await expect(card.locator('.ops-actions__next')).toContainText('Terlambat 3 jam');
  await card.getByRole('button', { name: 'Lewat batas: 1 Voice' }).click();
  await expect(page).toHaveURL(/\/work-items\?/);
  await expect(page).toHaveURL(/due=OVERDUE/);
  await expect(page).toHaveURL(/area=SUNTER_1/);
  await page.goBack();
  await card.locator('.ops-actions__next').click();
  await expect(page).toHaveURL(/\/voices\/00000000-0000-4000-8000-000000000302$/);
});
test('Voice Member opens with the summaries and orders what needs action first', async ({
  page,
}) => {
  const lists: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/work-items') lists.push(url);
  });
  await mockWorkforceApi(page, {
    session: manager,
    voiceList: actionList,
    dashboardSummary: actionSummary,
  });
  await page.goto('/work-items');
  await expect(page.getByRole('heading', { name: 'Voice Member', level: 1 })).toBeVisible();
  // The header carries no counts; the summaries below do.
  await expect(page.locator('.hero-band__stats')).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="ops-actions"]')).toBeVisible();
  const strip = page.getByRole('group', { name: 'Status Voice' });
  await expect(strip.getByRole('button')).toHaveCount(4);
  await expect(strip).toContainText('Direspon');
  await expect.poll(() => lists.at(-1)?.searchParams.get('sort')).toBe('action');
  await expect(page.locator('.inbox-card__due').first()).toBeVisible();
  await page.getByRole('button', { name: 'Lewat batas: 1 Voice' }).click();
  await expect(page).toHaveURL(/due=OVERDUE/);
  await expect.poll(() => lists.at(-1)?.searchParams.get('due')).toBe('OVERDUE');
  await page.getByRole('combobox', { name: 'Urutkan', exact: true }).click();
  await page.getByRole('option', { name: 'Terbaru', exact: true }).click();
  await expect.poll(() => lists.at(-1)?.searchParams.get('sort')).toBe('newest');
  expect((await new AxeBuilder({ page }).include('.ops').analyze()).violations).toEqual([]);
});
