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

// Closure review window (PRD §17.5): a closed voice sits PENDING for two days
// while the reporter rates it; a low rating with reopen rejects the closure,
// a high rating accepts it, and an expired window auto-accepts while still
// allowing a late feedback-only rating. The clock is pinned so the countdown
// and auto-accept notices are deterministic. The fixture is a factory because
// the mock's rate handler mutates the voice it serves: with fully-parallel
// workers sharing one module instance, a shared object would leak one test's
// rating/reopen into the next test's fixtures.

function closedVoiceFixture() {
  return {
    ...voice,
    status: 'CLOSED',
    availableActions: ['RATE'],
    closureCycles: [
      {
        id: 'cycle-1',
        cycleNumber: 1,
        note: 'Pelindung kabel diganti dan area diamankan.',
        closedAt: '2026-08-04T07:00:00.000Z',
        reopenedAt: null,
        reviewState: 'PENDING',
        reviewDeadline: '2026-08-06T07:00:00.000Z',
        reviewResolvedAt: null,
        evidence: [],
        rating: null,
      },
    ],
  };
}

test('shows the review window, then a low rating with reopen reopens the voice', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await mockApi(page, closedVoiceFixture());
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);

  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  // The pending review surfaces as a countdown notice and a derived status.
  await expect(page.getByText(/Beri penilaian dalam 21 jam lagi/)).toBeVisible();
  await expect(page.getByText('Menunggu Penilaian').first()).toBeVisible();
  await expect(page.getByText(/Otomatis diterima .* tanpa penilaian/)).toBeVisible();

  await page.getByRole('radio', { name: '2/5' }).click();
  await expect(page.getByText('Feedback wajib untuk rating 1–2.')).toBeVisible();
  // The reopen action submits atomically with the low rating (PRD §17.3).
  const reopenAction = page.getByRole('button', { name: 'Buka kembali', exact: true });
  await expect(reopenAction).toBeVisible();
  await expect(reopenAction).toBeDisabled();
  await expect(page.getByText(/Rating dan reopen akan dikirim bersamaan/)).toBeVisible();

  await page.getByLabel('Tulis umpan balik').fill('Masalahnya masih berulang.');
  await expect(reopenAction).toBeEnabled();
  await reopenAction.click();
  // The detail refetches: the cycle is rejected and the voice reopens into
  // verification, displayed as "Dibuka Kembali" rather than "Verifikasi".
  await expect(page.getByText('Dibuka Kembali').first()).toBeVisible();
  await expect(page.getByText('Ditolak · dibuka kembali')).toBeVisible();
});

test('a high rating accepts the closure and hides the reopen action', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await mockApi(page, closedVoiceFixture());
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);

  await expect(page.getByText(/Beri penilaian dalam 21 jam lagi/)).toBeVisible();
  await page.getByRole('radio', { name: '4/5' }).click();
  // No feedback gate and no reopen affordance for an accepting rating.
  await expect(page.getByText('Feedback wajib untuk rating 1–2.')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Buka kembali', exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Kirim penilaian' }).click();
  await expect(page.getByText('Diterima', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ditolak · dibuka kembali')).toBeHidden();
});

test('a low rating can explicitly accept the closure without reopening', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await mockApi(page, closedVoiceFixture());
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);

  await page.getByRole('radio', { name: '1/5' }).click();
  await page.getByLabel('Tulis umpan balik').fill('Belum sempurna, tetapi dapat ditutup.');
  await page.getByRole('button', { name: 'Kirim tanpa buka kembali' }).click();

  // The explicit accepting decision sends the same rating atomically with
  // `reopen: false` and consumes the closure cycle.
  await expect(page.getByText('Diterima', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ditolak · dibuka kembali')).toBeHidden();
});

test('does not offer reopen for an expired pending payload while the worker is delayed', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-08-06T08:00:00Z'));
  await mockApi(page, closedVoiceFixture());
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);

  await page.getByRole('radio', { name: '2/5' }).click();
  await expect(page.getByText('Feedback wajib untuk rating 1–2.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka kembali', exact: true })).toBeHidden();

  await page.getByLabel('Tulis umpan balik').fill('Masalah masih ada setelah deadline.');
  await page.getByRole('button', { name: 'Kirim penilaian' }).click();
  await expect(page.getByText('Diterima', { exact: true }).first()).toBeVisible();
});

test('an auto-accepted voice offers a late feedback-only rating', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  const fixture = closedVoiceFixture();
  await mockApi(page, {
    ...fixture,
    closureCycles: [
      {
        ...fixture.closureCycles[0]!,
        reviewState: 'ACCEPTED',
        reviewResolvedAt: '2026-08-06T07:00:00.000Z',
        reopenedAt: null,
        rating: null,
      },
    ],
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/voices/${voice.id}`);

  // The auto-accept notice replaces the countdown; the voice reads "Diterima".
  await expect(
    page.getByText(/Voice diterima otomatis .* karena tidak ada penilaian/),
  ).toBeVisible();
  await expect(page.getByText('Diterima', { exact: true }).first()).toBeVisible();

  await page.getByRole('radio', { name: '2/5' }).click();
  // Feedback is still mandatory, but reopen is gone even on a low score.
  await expect(page.getByText('Feedback wajib untuk rating 1–2.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka kembali', exact: true })).toBeHidden();

  await page.getByLabel('Tulis umpan balik').fill('Sebenarnya sudah beres.');
  await page.getByRole('button', { name: 'Kirim penilaian' }).click();
  await expect(page.getByText('Diterima', { exact: true }).first()).toBeVisible();
});

test('prompts the reporter from home when a closure awaits rating', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await mockApi(page, closedVoiceFixture());
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  const card = page.getByRole('heading', { name: 'Menunggu penilaian Anda' });
  await expect(card).toBeVisible();
  await expect(page.getByText(/otomatis diterima 21 jam lagi/)).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(voice.title) })
    .first()
    .click();
  await expect(page).toHaveURL(`/voices/${voice.id}`);
});
