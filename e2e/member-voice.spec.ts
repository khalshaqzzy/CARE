import { expect, test } from '@playwright/test';
import { mockApi, type MockVoice } from './helpers/mock-api';

const voice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'REPORTER_SELF',
  visibility: 'GENERAL',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title: 'Pencahayaan area produksi kurang',
  detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
  availableActions: ['MESSAGE', 'PROCEED', 'CLOSE'],
};

test('renders the Member home hero and recent voice card', async ({ page }) => {
  await mockApi(page, voice);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
  await expect(page.getByText('Buat Voice').first()).toBeVisible();
  await expect(page.getByText(voice.title)).toBeVisible();
});

test('renders a paginated voice detail with timeline and conversation', async ({ page }) => {
  await mockApi(page, voice);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);

  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  // The Timeline row is collapsed by default; expand it to reveal the events.
  await page.getByRole('button', { name: /Timeline/ }).click();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  await expect(page.getByText('Percakapan')).toBeVisible();
  // The room itself lives on the dedicated chat page.
  await page.getByRole('button', { name: /Percakapan/ }).click();
  await expect(page).toHaveURL(/\/voices\/voice-1\/chat$/);
  // The mock returns a nextCursor, so the "load older" affordance is shown.
  await expect(page.getByText('Muat pesan sebelumnya')).toBeVisible();
  await expect(page.getByText('Mohon konfirmasi lokasi kejadian.')).toBeVisible();
});

test('surfaces responder actions for an IN_PROGRESS voice', async ({ page }) => {
  await mockApi(page, voice);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);
  // availableActions includes CLOSE, so the Tindakan action row shows it.
  await expect(page.getByRole('group', { name: 'Tindakan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tutup', exact: true })).toBeVisible();
});
