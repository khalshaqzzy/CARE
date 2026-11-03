import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

// Chrome on Android 14+ hides the camera behind the gallery-only photo picker
// for image inputs, so touch devices choose the source first (ADR-0077).
const png = {
  name: 'foto.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

const responder = {
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
    conversationState: 'ACTIVE',
  },
} as const;

// A saved draft, so the wizard uploads straight away.
const draft = {
  id: 'draft-1',
  visibility: 'GENERAL',
  area: 'KARAWANG_1',
  locationDetail: 'Gedung A, lantai 1',
  title: 'Lantai licin',
  detail: 'Lantai licin di dekat mesin produksi.',
  version: 1,
  attachments: [],
};

async function openCreateMedia(page: Page) {
  await page.goto('/voices/new');
  await page.getByRole('radio', { name: /General Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('heading', { name: 'Detail Voice General' })).toBeVisible();
}

/** Picks an option in the source sheet and returns the chooser it opened. */
async function choose(page: Page, option: 'Ambil foto' | 'Pilih dari galeri') {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('dialog', { name: 'Tambah foto' })
    .getByRole('button', { name: option })
    .click();
  return chooser;
}

test.describe('touch devices', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 800 } });

  test('Create Voice offers the camera and the gallery', async ({ page }) => {
    await mockWorkforceApi(page, { draft });
    await page.goto('/drafts/draft-1/edit');
    await page.getByRole('button', { name: /Tambah foto, sisa 5/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah foto' });
    await expect(sheet.getByRole('button', { name: 'Ambil foto' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Pilih dari galeri' })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('.photo-source').analyze()).violations).toEqual(
      [],
    );

    const camera = await choose(page, 'Ambil foto');
    await expect(sheet).toHaveCount(0);
    const input = camera.element();
    expect(await input.getAttribute('capture')).toBe('environment');
    expect(await input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(camera.isMultiple()).toBe(false);
    const upload = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/drafts\/[^/]+\/attachments$/.test(r.url()),
    );
    await camera.setFiles(png);
    await upload;
    await expect(page.getByRole('button', { name: /Lihat gambar 1 dari 1/ })).toBeVisible();

    await page.getByRole('button', { name: /Tambah foto, sisa 4/ }).click();
    const gallery = await choose(page, 'Pilih dari galeri');
    expect(await gallery.element().getAttribute('capture')).toBeNull();
    expect(gallery.isMultiple()).toBe(true);
  });

  test('chat attaches a camera photo to the next message', async ({ page }) => {
    await mockWorkforceApi(page, responder);
    await page.goto('/voices/voice-1/chat');
    await page.getByRole('button', { name: 'Lampirkan gambar' }).click();
    const camera = await choose(page, 'Ambil foto');
    expect(await camera.element().getAttribute('capture')).toBe('environment');
    await camera.setFiles(png);
    await expect(page.locator('.chat-composer__picked')).toContainText('foto.png');
  });

  test('closure evidence can be taken with the camera', async ({ page }) => {
    await mockWorkforceApi(page, responder);
    await page.goto('/voices/voice-1');
    await page.getByRole('button', { name: 'Selesaikan Voice', exact: true }).click();
    await page.getByRole('button', { name: 'Tambah foto' }).click();
    const camera = await choose(page, 'Ambil foto');
    expect(await camera.element().getAttribute('capture')).toBe('environment');
    const upload = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/closure-evidence'),
    );
    await camera.setFiles(png);
    await upload;
    await expect(page.getByRole('dialog', { name: 'Tutup Voice' })).toBeVisible();
  });
});

test('mouse devices open the file dialog directly', async ({ page }) => {
  await mockWorkforceApi(page, {});
  await openCreateMedia(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Tambah foto, sisa 5/ }).click();
  const picker = await chooser;
  expect(await picker.element().getAttribute('capture')).toBeNull();
  expect(picker.isMultiple()).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Tambah foto' })).toHaveCount(0);
});
