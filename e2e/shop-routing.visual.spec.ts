import { expect, test, type Page } from '@playwright/test';
import { capture } from './helpers/capture';
import { memberSession, mockAdminApi, mockWorkforceApi } from './helpers/mock-api';
import { visualPlatform } from './helpers/visual-platform';

// Incident-shop routing: reporter confirmation on the draft review, the
// Manager's location-aware assignment sheet, and Admin shop configuration.

const assy1 = {
  id: '30000000-0000-4000-8000-000000000001',
  department: 'Assembly & PIO Production #1 Dept',
};
const assy2 = {
  id: '30000000-0000-4000-8000-000000000002',
  department: 'Assembly & PIO Production #2 Dept',
};

const shopResolution = (overrides: Record<string, unknown>) => ({
  applies: true,
  status: 'NEEDS_CONFIRMATION',
  source: null,
  shop: null,
  candidates: [assy1],
  areaShops: [assy1, assy2],
  ...overrides,
});

const draftPreview = (resolution: Record<string, unknown>, version = 1) => ({
  id: 'draft-1',
  visibility: 'GENERAL',
  area: 'KARAWANG_1',
  locationDetail: 'asy line 2 dekat pos 3',
  title: 'Torque wrench di stasiun 5 sering error',
  detail:
    'Torque wrench di stasiun 5 sering error sehingga operator harus mengulang pengencangan baut.',
  showReporterIdentity: false,
  version,
  classificationContentHash: 'a'.repeat(64),
  locationContentHash: 'b'.repeat(64),
  classification: {
    source: 'AI',
    category: 'WORK_DIFFICULTY',
    severity: 'MEDIUM',
    confidence: 0.9,
    rationaleCode: 'NOT_REQUESTED',
  },
  categoryNameSnapshot: 'Fasilitas Kerja / Kesulitan Kerja',
  locationReview: {
    id: 'lr-1',
    completeness: 'COMPLETE',
    warning: null,
    questions: [],
    contentHash: 'c'.repeat(64),
  },
  attachments: [],
  routeReadiness:
    resolution.status === 'NEEDS_CONFIRMATION'
      ? { ready: false, reason: 'SHOP_CONFIRMATION_REQUIRED' }
      : { ready: true, targetLabel: 'Department Head' },
  routeTarget: 'Department Head',
  shopResolution: resolution,
});

async function openReview(page: Page, width: number, resolution: Record<string, unknown>) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { draftPreview: draftPreview(resolution) });
  const confirmations: unknown[] = [];
  await page.route('**/api/v1/drafts/draft-1/shop-confirmation', async (route) => {
    const body = route.request().postDataJSON() as { shopLocationId: string | null };
    confirmations.push(body);
    const shop = [assy1, assy2].find((item) => item.id === body.shopLocationId) ?? null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        draftPreview(
          shop
            ? shopResolution({
                status: 'RESOLVED',
                source: 'REPORTER_CONFIRMED',
                shop,
                candidates: [],
              })
            : shopResolution({
                status: 'NOT_SHOP',
                source: 'REPORTER_NOT_SHOP',
                candidates: [],
              }),
          2,
        ),
      ),
    });
  });
  await page.goto('/drafts/draft-1/preview');
  await expect(page.getByRole('heading', { name: 'Tinjau sebelum kirim' })).toBeVisible();
  return confirmations;
}

for (const width of [360, 1440]) {
  test(`reporter confirms a suggested incident shop at ${width}`, async ({ page }) => {
    const confirmations = await openReview(page, width, shopResolution({}));
    const card = page.getByRole('region', { name: 'Konfirmasi lokasi kejadian' });
    await expect(card).toContainText('Pilih Shop agar Voice diterima oleh PIC yang tepat');
    await expect(card).toContainText(`Apakah maksud Anda ${assy1.department} (Karawang 1)?`);
    await expect(page.getByText('Menunggu konfirmasi lokasi')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeDisabled();
    await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await capture(page, `shop-confirm-single-${width}-${visualPlatform}.png`);

    await card.getByRole('button', { name: 'Ya, benar' }).click();
    const row = page.getByRole('region', { name: 'Lokasi kejadian' });
    await expect(row).toContainText(`${assy1.department} · Karawang 1`);
    expect(confirmations).toEqual([{ shopLocationId: assy1.id, expectedVersion: 1 }]);
    await expect(page.getByText(`Manager ${assy1.department}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeEnabled();
    await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await capture(page, `shop-confirmed-${width}-${visualPlatform}.png`);
  });
}

test('reporter picks among ambiguous shops or answers not in a shop', async ({ page }) => {
  const confirmations = await openReview(page, 360, shopResolution({ candidates: [assy1, assy2] }));
  const card = page.getByRole('region', { name: 'Konfirmasi lokasi kejadian' });
  await expect(card.getByRole('radio')).toHaveCount(3);
  await expect(card.getByRole('button', { name: 'Konfirmasi lokasi' })).toBeDisabled();
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await capture(page, `shop-confirm-multiple-360-${visualPlatform}.png`);
  await card.getByRole('radio', { name: /Bukan di area shop/ }).click();
  await card.getByRole('button', { name: 'Konfirmasi lokasi' }).click();
  await expect(page.getByRole('region', { name: 'Lokasi kejadian' })).toContainText(
    'Bukan di area shop',
  );
  expect(confirmations).toEqual([{ shopLocationId: null, expectedVersion: 1 }]);
});

test('a resolved shop can be changed from the full area list', async ({ page }) => {
  const confirmations = await openReview(
    page,
    1440,
    shopResolution({ status: 'RESOLVED', source: 'ALIAS', shop: assy1, candidates: [] }),
  );
  const row = page.getByRole('region', { name: 'Lokasi kejadian' });
  await row.getByRole('button', { name: 'Ubah' }).click();
  const card = page.getByRole('region', { name: 'Konfirmasi lokasi kejadian' });
  await card.getByRole('radio', { name: new RegExp(assy2.department) }).click();
  await card.getByRole('button', { name: 'Konfirmasi lokasi' }).click();
  await expect(page.getByRole('region', { name: 'Lokasi kejadian' })).toContainText(
    assy2.department,
  );
  expect(confirmations).toEqual([{ shopLocationId: assy2.id, expectedVersion: 1 }]);
  await capture(page, `shop-changed-1440-${visualPlatform}.png`);
});

test('non-location categories show no shop confirmation', async ({ page }) => {
  await openReview(page, 360, shopResolution({ applies: false }));
  await expect(page.getByRole('region', { name: 'Konfirmasi lokasi kejadian' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kirim Voice' })).toBeEnabled();
  await capture(page, `shop-not-applicable-360-${visualPlatform}.png`);
});

for (const width of [360, 1440]) {
  test(`assignment sheet shows incident location and candidate sections at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockWorkforceApi(page, {
      session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
      voice: {
        id: 'voice-1',
        displayId: 'CARE-202609-000123',
        audience: 'GENERAL_RESPONDER',
        visibility: 'GENERAL',
        area: 'SUNTER_1',
        status: 'OPEN',
        title: 'Hand pallet di gudang sering macet',
        detail: 'Hand pallet di rak 3 sering macet saat mengangkut part.',
        availableActions: ['ASSIGN'],
        locationDetail: 'gudang log rak 3 dekat dock B',
        shopLocation: { department: 'Logistic Operation Unit Dept', source: 'ALIAS' },
      },
      assignmentCandidates: [
        {
          id: 'sh-1',
          displayName: 'Agus Pratama Wicaksono',
          activeCount: 2,
          section: 'Warehouse Operation Sunter 1 Receiving & Dispatch Sect',
        },
        { id: 'sh-2', displayName: 'Dewi Lestari', activeCount: 0, section: 'Karawang 3 Sect' },
        { id: 'sh-3', displayName: 'Yusuf Hidayat', activeCount: 1 },
      ],
    });
    await page.goto('/voices/voice-1');
    await page.getByRole('button', { name: 'Assign PIC', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const location = dialog.getByLabel('Lokasi kejadian');
    await expect(location).toContainText('Sunter 1 · Logistic Operation Unit Dept');
    await expect(location).toContainText('gudang log rak 3 dekat dock B');
    await expect(dialog.getByRole('radio', { name: /Agus Pratama Wicaksono/ })).toContainText(
      '2 Voice aktif · Warehouse Operation Sunter 1',
    );
    await expect(dialog.getByRole('radio', { name: /Yusuf Hidayat/ })).toContainText(
      '1 Voice aktif',
    );
    await capture(dialog, `shop-assignment-${width}-${visualPlatform}.png`);
  });
}

test('admin configures shop locations per area', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const logistic = {
    id: '40000000-0000-4000-8000-000000000001',
    status: 'ACTIVE',
    version: 3,
    updatedAt: '2026-09-29T02:00:00.000Z',
    areas: ['KARAWANG_3', 'SUNTER_1', 'SUNTER_2'],
    aliases: ['logistic', 'log', 'gudang', 'warehouse'],
    organizationUnit: {
      id: 'unit-log',
      directorate: 'Manufacturing & PE Dir',
      division: 'Logistic Div',
      department: 'Logistic Operation Unit Dept',
    },
    pic: { id: 'pic-log', name: 'Rina Kartika', noReg: '003318' },
    health: 'HEALTHY',
  } as const;
  await mockAdminApi(page, {
    shopLocations: [
      {
        ...logistic,
        id: '40000000-0000-4000-8000-000000000002',
        areas: ['KARAWANG_1'],
        aliases: ['assy', 'asy', 'assy 1'],
        organizationUnit: {
          ...logistic.organizationUnit,
          id: 'unit-assy',
          department: assy1.department,
        },
        pic: null,
        health: 'GAP',
      },
      { ...logistic, areas: [...logistic.areas], aliases: [...logistic.aliases] },
    ],
    unmatchedShopLocations: [
      { area: 'KARAWANG_1', locationDetail: 'area perakitan dekat pos 3', count: 4 },
    ],
  });
  let update: unknown = null;
  await page.route('**/api/v1/admin/shop-locations/*', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    update = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(logistic),
    });
  });
  await page.goto('http://127.0.0.1:4174/remediation');
  const section = page.getByRole('region', { name: 'Lokasi shop' });
  await expect(section).toContainText('Logistic Operation Unit Dept');
  await expect(section).toContainText('area perakitan dekat pos 3');
  await section.scrollIntoViewIfNeeded();
  await capture(section, 'admin-shop-locations-1440.png');

  await section
    .getByRole('row', { name: /Logistic Operation Unit Dept/ })
    .getByRole('button', { name: 'Ubah' })
    .click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('checkbox', { name: 'Sunter 1' })).toBeChecked();
  await drawer.getByRole('checkbox', { name: 'Karawang 3' }).click();
  await drawer.getByRole('textbox', { name: 'Tambah alias' }).fill('Gudang Sunter');
  await drawer.getByRole('button', { name: 'Tambah', exact: true }).click();
  await drawer.getByRole('button', { name: 'Hapus alias log', exact: true }).click();
  await capture(drawer, 'admin-shop-location-drawer-1440.png');
  await drawer.getByRole('button', { name: 'Simpan lokasi shop' }).click();
  await expect
    .poll(() => update)
    .toEqual({
      areas: ['SUNTER_1', 'SUNTER_2'],
      aliases: ['logistic', 'gudang', 'warehouse', 'gudang sunter'],
      expectedVersion: 3,
    });
});
