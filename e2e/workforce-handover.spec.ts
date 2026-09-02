import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

const manager = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Department Head',
});
const voice = {
  id: 'voice-1',
  displayId: 'CARE-202609-000007',
  audience: 'GENERAL_RESPONDER',
  visibility: 'GENERAL' as const,
  status: 'OPEN',
  area: 'KARAWANG_1',
  title: 'Bahaya kebakaran',
  detail: 'Ditemukan potensi bahaya kebakaran di area parkir.',
  availableActions: ['ASSIGN', 'ASK', 'HANDOVER', 'PROCEED'],
};
const option = {
  category: { id: 'category-target', key: 'WORK_DIFFICULTY', name: 'Kesulitan Kerja' },
  routeMode: 'RELATED_REPORTER_DEPARTMENT',
  department: {
    id: 'department-target',
    directorate: 'Manufacturing',
    division: 'Production',
    department: 'Production Engineering',
  },
  pic: { id: 'manager-target', displayName: 'Yudo Ardiyanto', type: 'DEPARTMENT_HEAD' },
  isReporterDepartment: true,
  available: true,
  disabledReason: null,
};
const gap = {
  category: { id: 'category-gap', key: 'FACILITY', name: 'Fasilitas Umum' },
  routeMode: 'FIXED_DEPARTMENT',
  department: null,
  pic: null,
  isReporterDepartment: false,
  available: false,
  disabledReason: 'PIC department tujuan belum tersedia.',
};
const handoverOptions = {
  current: {
    category: { id: 'category-current', key: 'SAFETY', name: 'Safety' },
    department: {
      id: 'department-current',
      directorate: 'Manufacturing',
      division: 'Plant',
      department: 'Plant GA & SHE',
    },
    pic: { id: 'manager-current', displayName: 'Dedi Slamet Riyadi', type: 'DEPARTMENT_HEAD' },
  },
  options: [option, gap],
};

test.describe('Manager handover', () => {
  test('completes selection, required note, confirmation, and returns to the active queue', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: manager, voice, handoverOptions });
    let submitted: Record<string, unknown> | null = null;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/voices/voice-1/handovers'))
        submitted = request.postDataJSON() as Record<string, unknown>;
    });

    await page.goto('/voices/voice-1');
    const actions = page.getByRole('group', { name: 'Keputusan Voice' });
    await expect(actions.getByRole('button', { name: 'Handover' })).toBeVisible();
    await actions.getByRole('button', { name: 'Handover' }).click();
    await expect(page.getByRole('heading', { name: 'Handover Voice' })).toBeVisible();
    await expect(page.getByText('Department Reporter')).toBeVisible();
    await expect(page.getByText('Rute belum tersedia')).toBeVisible();

    const submit = page.getByRole('button', { name: /Lanjutkan Handover/ });
    await expect(submit).toBeDisabled();
    const target = page.getByRole('radio', { name: /Kesulitan Kerja/ });
    await target.focus();
    await page.keyboard.press('Space');
    await page
      .getByRole('textbox', { name: /Detail handover/ })
      .fill('Mohon lanjutkan verifikasi kondisi area reporter.');
    await expect(submit).toBeEnabled();
    await submit.click();

    const dialog = page.getByRole('dialog', { name: 'Konfirmasi handover' });
    await expect(dialog.getByText('Production Engineering')).toBeVisible();
    await expect(dialog.getByText('Yudo Ardiyanto')).toBeVisible();
    await expect(dialog.getByText(/hanya dapat dibaca oleh Anda dan PIC tujuan/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Konfirmasi Handover' }).click();
    await expect(page).toHaveURL(/\/work-items$/);
    await expect(page.getByText('Voice berhasil dihandover kepada PIC baru.')).toBeVisible();
    expect(submitted).toMatchObject({
      targetCategoryId: 'category-target',
      detail: 'Mohon lanjutkan verifikasi kondisi area reporter.',
      expectedVersion: 3,
    });
  });

  test('searches routes, remains axe-clean, and preserves the note after a stale conflict', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await mockWorkforceApi(page, {
      session: manager,
      voice,
      handoverOptions,
      handoverError: { status: 409, code: 'VERSION_CONFLICT' },
    });
    await page.goto('/voices/voice-1/handover');
    await page.getByRole('textbox', { name: 'Cari tujuan handover' }).fill('Yudo');
    await expect(page.getByRole('radio', { name: /Kesulitan Kerja/ })).toBeVisible();
    await expect(page.getByText('Fasilitas Umum')).not.toBeVisible();
    await page.getByRole('radio', { name: /Kesulitan Kerja/ }).click();
    const note = page.getByRole('textbox', { name: /Detail handover/ });
    await note.fill('Catatan harus tetap ada setelah konflik.');
    await page.getByRole('button', { name: /Lanjutkan Handover/ }).click();
    await page.getByRole('button', { name: 'Konfirmasi Handover' }).click();
    await expect(page.getByText(/Voice telah berubah/)).toBeVisible();
    await expect(note).toHaveValue('Catatan harus tetap ada setelah konflik.');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('Handover Saya opens only the restricted history surface', async ({ page }) => {
    const record = {
      id: 'handover-1',
      sequence: 1,
      from: handoverOptions.current,
      to: option,
      routeMode: option.routeMode,
      isReporterDepartment: true,
      createdAt: '2026-09-02T08:00:00.000Z',
      detail: 'Catatan privat transfer.',
      direction: 'SENT',
      voice: { id: 'voice-1', displayId: voice.displayId },
    };
    await mockWorkforceApi(page, {
      session: manager,
      voice,
      myHandovers: { items: [record], nextCursor: null },
      handoverHistory: {
        voice: record.voice,
        accessMode: 'PARTICIPANT_ONLY',
        items: [record],
      },
    });
    await page.goto('/work-items?view=HANDOVERS');
    await expect(page.getByText(voice.displayId)).toBeVisible();
    await expect(page.getByText(voice.title)).not.toBeVisible();
    await page.getByRole('button', { name: /Buka riwayat/ }).click();
    await expect(page).toHaveURL(/\/voices\/voice-1\/handover-history$/);
    await expect(page.getByText('Catatan privat transfer.')).toBeVisible();
    await expect(page.getByText(voice.title)).not.toBeVisible();
  });
});
