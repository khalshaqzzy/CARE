import { expect, test } from '@playwright/test';
import { mockAdminApi, type MockVoice } from './helpers/mock-api';

const voice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
  visibility: 'PRIVATE',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title: 'Keluhan fasilitas toilet',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  availableActions: [],
};

test('renders the Admin Voice Explorer table and read-only drawer', async ({ page }) => {
  await mockAdminApi(page, voice);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:4174/voices');

  await expect(page.getByRole('heading', { name: 'Voice Explorer' })).toBeVisible();
  await expect(page.getByText('Akses Private diaudit', { exact: true })).toBeVisible();
  await expect(page.getByText(voice.title)).toBeVisible();

  await page.getByRole('button', { name: 'Detail' }).click();
  await expect(page.getByText('SUBMITTED')).toBeVisible();
  await expect(page.getByText('Hello')).toBeVisible();
  // Private reporter identity is shown read-only to Admin.
  await expect(page.getByText(/Budi Santoso \(000128\)/)).toBeVisible();
});
