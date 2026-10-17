import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi, unionPrivateVoiceDetail } from './helpers/mock-api';

// ADR-0069: below the closing level the PIC reports done and the levels above
// approve in turn; the last one closes the Voice.
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const leader = (accountId: string, capability: string, structuralPosition: string) =>
  memberSession({ accountId, capabilities: ['MEMBER', capability], structuralPosition });
const steps = (sectionHead: string, manager: string, late = false) => [
  {
    level: 'SECTION_HEAD',
    names: ['Budi Santoso'],
    state: sectionHead,
    dueAt: sectionHead === 'PENDING' ? hours(late ? -5 : 30) : null,
    late,
  },
  {
    level: 'MANAGER',
    names: ['Rina Kusuma'],
    state: manager,
    dueAt: manager === 'PENDING' ? hours(40) : null,
    late: false,
  },
];
const report = {
  reportedAt: hours(-20),
  reportedBy: 'Andi Pratama',
  note: 'Kran wastafel lantai 2 sudah diganti.',
  evidence: [],
};
const voice = (overrides: Record<string, unknown>) => ({
  ...unionPrivateVoiceDetail({
    id: 'closure-voice',
    displayId: 'CARE-202610-000031',
    visibility: 'GENERAL',
    status: 'IN_PROGRESS',
    severity: 'MEDIUM',
    area: 'KARAWANG_1',
    title: 'Wastafel lantai 2 bocor',
    detail: 'Air wastafel terus menetes.',
    availableActions: ['MESSAGE'],
  } as never),
  visibility: 'GENERAL',
  audience: 'GENERAL_RESPONDER',
  conversationState: 'ACTIVE',
  reporter: { name: 'Sari', noReg: '000129', division: 'Plant 1', department: 'GA' },
  ...overrides,
});

test('the PIC reports a Medium Voice done instead of closing it', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: leader('gl-1', 'GROUP_LEADER', 'Group Leader'),
    voiceDetail: voice({ availableActions: ['MESSAGE', 'REPORT_DONE'] }),
  });
  await page.goto('/voices/closure-voice');
  await expect(page.getByRole('button', { name: 'Selesaikan Voice' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lapor Sudah Selesai' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lapor Sudah Selesai' });
  await expect(dialog.getByRole('button', { name: 'Kirim laporan' })).toBeDisabled();
  await dialog.getByLabel('Catatan penyelesaian').fill('Sudah diganti.');
  await expect(dialog.getByRole('button', { name: 'Kirim laporan' })).toBeEnabled();
});

test('approvers see the report and the level that closes it', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: leader('sh-1', 'SECTION_HEAD', 'Section Head'),
    voiceDetail: voice({
      availableActions: ['MESSAGE', 'APPROVE_CLOSURE', 'RETURN_CLOSURE'],
      closureApproval: { ...report, steps: steps('PENDING', 'NEXT', true) },
    }),
  });
  await page.goto('/voices/closure-voice');
  const card = page.getByRole('region', { name: 'Persetujuan penyelesaian' });
  await expect(card).toContainText('Kran wastafel lantai 2 sudah diganti.');
  await expect(card).toContainText('Terlambat');
  await expect(card).toContainText('Manager · menutup');
  await expect(page.getByRole('button', { name: 'Setujui' })).toBeVisible();
  await page.getByRole('button', { name: 'Kembalikan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kembalikan ke PIC' });
  await expect(dialog.getByRole('button', { name: 'Kembalikan' })).toBeDisabled();
});

test('the last level closes, and the reporter only sees that it waits', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: leader('mgr-1', 'MANAGER', 'Department Head'),
    voiceDetail: voice({
      availableActions: ['MESSAGE', 'APPROVE_CLOSURE', 'RETURN_CLOSURE'],
      closureApproval: { ...report, steps: steps('APPROVED', 'PENDING') },
    }),
  });
  await page.goto('/voices/closure-voice');
  await expect(page.getByRole('button', { name: 'Tutup Voice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Setujui' })).toHaveCount(0);

  await mockWorkforceApi(page, {
    session: memberSession({ accountId: 'reporter-1' }),
    voiceDetail: voice({
      audience: 'REPORTER_SELF',
      closureApproval: { reportedAt: hours(-20), steps: [] },
    }),
  });
  await page.goto('/voices/closure-voice');
  await expect(page.getByText('Menunggu persetujuan atasan')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Persetujuan penyelesaian' })).toHaveCount(0);
});

test('Perlu Disetujui shows only for leaders who approve', async ({ page }) => {
  const summary = (approves: boolean) => ({
    total: 3,
    open: 1,
    responded: 0,
    inProgress: 1,
    toApprove: approves ? 1 : 0,
    approves,
    overdue: 0,
    dueSoon: 0,
    critical: 0,
    closedByMe: 2,
    attention: { overdue: 0, dueSoon: 0, critical: 0 },
    status: [
      { label: 'OPEN', value: 1 },
      { label: 'RESPONDED', value: 0 },
      { label: 'IN_PROGRESS', value: 2 },
      { label: 'CLOSED', value: 2 },
    ],
  });
  const tiles = page.locator('section.ops-actions .ops-actions__tile');
  await mockWorkforceApi(page, {
    session: leader('gl-1', 'GROUP_LEADER', 'Group Leader'),
    dashboardSummary: summary(false),
  });
  await page.goto('/');
  await expect(tiles).toHaveCount(4);
  await expect(page.getByRole('button', { name: /Perlu Disetujui/ })).toHaveCount(0);

  await mockWorkforceApi(page, {
    session: leader('sh-1', 'SECTION_HEAD', 'Section Head'),
    dashboardSummary: summary(true),
  });
  await page.goto('/');
  await expect(tiles).toHaveCount(5);
  await page.getByRole('button', { name: 'Perlu Disetujui: 1 Voice' }).click();
  await expect(page).toHaveURL(/action=approve/);
});
