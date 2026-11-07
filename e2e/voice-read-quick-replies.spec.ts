import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { memberSession, mockAdminApi, mockWorkforceApi } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';
const manager = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Department Head',
});
const me = manager.account.id;
const voice = {
  id: 'voice-1',
  displayId: 'CARE-202611-000042',
  audience: 'GENERAL_RESPONDER',
  visibility: 'GENERAL' as const,
  area: 'KARAWANG_1',
  title: 'Lampu area parkir mati',
  detail: 'Lampu di area parkir motor blok B mati sejak kemarin malam.',
};
const reporter = { id: 'reporter-1', displayName: 'Andi Pratama', role: 'REPORTER' };
const sectionHead = { id: 'sh-1', displayName: 'Rina Kartika', role: 'SECTION_HEAD' };
const quickReplies = {
  REPLY: [
    { id: 'qr-1', label: 'Diterima', text: 'Terima kasih, Voice sudah kami terima.' },
    { id: 'qr-2', label: 'Cek lokasi', text: 'Kami akan cek langsung ke lokasi.' },
  ],
  PROCESS: [{ id: 'qr-3', label: 'Saya tangani', text: 'Voice ini saya tangani langsung.' }],
  HANDOVER: [{ id: 'qr-4', label: 'Bukan area kami', text: 'Lokasi bukan area kami.' }],
  CLOSE: [{ id: 'qr-5', label: 'Sudah diperbaiki', text: 'Perbaikan sudah selesai.' }],
};

function message(id: string, senderId: string, text: string, minute: number, receipt?: object) {
  return {
    id,
    text,
    kind: 'USER',
    createdAt: `2026-11-07T01:${String(minute).padStart(2, '0')}:00.000Z`,
    senderId,
    senderAccountKind: 'WORKFORCE',
    sender: {
      kind: 'WORKFORCE',
      displayName: senderId === me ? manager.account.displayName : 'Andi Pratama',
    },
    attachments: [],
    ...(receipt ? { receipt } : {}),
  };
}

/** Records the read calls the app makes while a Voice is open. */
function trackReads(page: Page) {
  const calls: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /\/(seen|conversation\/read)$/.test(path))
      calls.push(path.replace('/api/v1/voices/voice-1/', ''));
  });
  return calls;
}

test.describe('Voice read state and Jawaban Cepat', () => {
  test('reads Voice notifications on open and chat ones only in the chat', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockWorkforceApi(page, {
      session: manager,
      voice: {
        ...voice,
        status: 'IN_PROGRESS',
        availableActions: ['MESSAGE'],
        participants: [reporter, { id: me, displayName: 'Saya', role: 'DEPARTMENT_HEAD' }],
      },
    });
    const calls = trackReads(page);
    await page.goto('/voices/voice-1');
    await expect.poll(() => calls).toContain('seen');
    expect(calls).not.toContain('conversation/read');

    await page.goto('/voices/voice-1/chat');
    await expect.poll(() => calls).toContain('conversation/read');
  });

  test('shows read ticks and who read each own message', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockWorkforceApi(page, {
      session: manager,
      voice: {
        ...voice,
        status: 'IN_PROGRESS',
        availableActions: ['MESSAGE'],
        conversationState: 'ACTIVE',
        participants: [
          reporter,
          { id: me, displayName: 'Saya', role: 'DEPARTMENT_HEAD' },
          sectionHead,
        ],
      },
    });
    const items = [
      message('m3', me, 'Teknisi dijadwalkan sore ini.', 30, {
        readBy: [],
        unread: [reporter, sectionHead],
      }),
      message('m2', me, 'Bu Rina, mohon dicek ke blok B.', 20, {
        readBy: [{ ...sectionHead, readAt: '2026-11-07T01:25:00.000Z' }],
        unread: [reporter],
      }),
      message('m1', 'reporter-1', 'Baik pak, terima kasih.', 10),
    ];
    await page.route('**/api/v1/voices/voice-1/messages*', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { items, nextCursor: null } })
        : route.fallback(),
    );
    await page.goto('/voices/voice-1/chat');

    await expect(page.getByRole('button', { name: /Terkirim\. Info pesan/ })).toBeVisible();
    // Messages from others carry no ticks.
    await expect(page.locator('.chat-msg.is-theirs .chat-msg__meta')).toHaveCount(0);
    await page.getByRole('button', { name: /Dibaca 1 dari 2\. Info pesan/ }).click();

    const info = page.getByRole('dialog', { name: 'Info pesan' });
    await expect(info.getByText('Bu Rina, mohon dicek ke blok B.')).toBeVisible();
    const read = info.getByRole('region', { name: 'Dibaca oleh' });
    await expect(read.getByText('Rina Kartika')).toBeVisible();
    await expect(read.locator('time')).toHaveText('08.25');
    await expect(info.getByRole('region', { name: 'Belum dibaca' })).toContainText('Andi Pratama');
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
    ).toEqual([]);
  });

  test('fills the Respons note from Jawaban Cepat', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const bodies: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/voices/voice-1/respond'))
        bodies.push(request.postDataJSON() as Record<string, unknown>);
    });
    await mockWorkforceApi(page, {
      session: manager,
      quickReplies,
      voice: { ...voice, status: 'OPEN', availableActions: ['RESPOND', 'ASSIGN', 'HANDOVER'] },
    });
    await page.goto('/voices/voice-1');
    await page.getByRole('button', { name: 'Respons', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Respons' });
    const chips = sheet.getByRole('group', { name: 'Jawaban cepat' });
    const note = sheet.getByRole('textbox', { name: 'Pesan' });

    await chips.getByRole('button', { name: 'Diterima' }).click();
    await expect(note).toHaveValue('Terima kasih, Voice sudah kami terima.');
    await expect(chips.getByRole('button', { name: 'Diterima' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // An untouched template is swapped; edited text keeps the chip appended.
    await chips.getByRole('button', { name: 'Cek lokasi' }).click();
    await expect(note).toHaveValue('Kami akan cek langsung ke lokasi.');
    await note.fill('Halo Pak Andi.');
    await chips.getByRole('button', { name: 'Diterima' }).click();
    await expect(note).toHaveValue('Halo Pak Andi.\nTerima kasih, Voice sudah kami terima.');

    // Each Respons option offers its own set; places without entries show none.
    await sheet.getByRole('radio', { name: 'Proses sendiri' }).click();
    await expect(chips.getByRole('button')).toHaveText(['Saya tangani']);
    await sheet.getByRole('radio', { name: 'Tugaskan PIC' }).click();
    await expect(sheet.getByRole('group', { name: 'Jawaban cepat' })).toHaveCount(0);

    await sheet.getByRole('radio', { name: 'Balas pesan' }).click();
    await sheet.getByRole('button', { name: 'Balas pesan', exact: true }).click();
    await expect
      .poll(() => bodies[0]?.text)
      .toBe('Halo Pak Andi.\nTerima kasih, Voice sudah kami terima.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('offers Jawaban Cepat when reporting done and handing over', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: manager,
      quickReplies,
      voice: {
        ...voice,
        status: 'IN_PROGRESS',
        availableActions: ['MESSAGE', 'REPORT_DONE'],
        conversationState: 'ACTIVE',
      },
    });
    await page.goto('/voices/voice-1');
    await page.locator('.action-row--primary').getByRole('button', { name: /Lapor/ }).click();
    const report = page.getByRole('dialog', { name: 'Lapor Sudah Selesai' });
    await report.getByRole('button', { name: 'Sudah diperbaiki' }).click();
    await expect(report.getByRole('textbox', { name: /Catatan penyelesaian/ })).toHaveValue(
      'Perbaikan sudah selesai.',
    );
    await expect(report.getByRole('button', { name: 'Kirim laporan' })).toBeEnabled();

    await page.goto('/voices/voice-1/handover');
    await page.getByRole('button', { name: 'Bukan area kami' }).click();
    await expect(page.getByRole('textbox', { name: /Detail handover/ })).toHaveValue(
      'Lokasi bukan area kami.',
    );
  });
});

type AdminItem = {
  id: string;
  placement: 'REPLY' | 'PROCESS' | 'ASSIGN' | 'ESCALATE' | 'HANDOVER' | 'CLOSE';
  label: string;
  text: string;
  active: boolean;
  sortOrder: number;
  version: number;
  updatedAt: string;
};

test('CARE Admin manages Jawaban Cepat per place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAdminApi(page);
  const updatedAt = '2026-11-07T01:00:00.000Z';
  let items: AdminItem[] = [
    {
      id: 'a1',
      placement: 'REPLY',
      label: 'Diterima',
      text: 'Terima kasih.',
      active: true,
      sortOrder: 0,
      version: 1,
      updatedAt,
    },
    {
      id: 'a2',
      placement: 'CLOSE',
      label: 'Sudah diperbaiki',
      text: 'Selesai.',
      active: true,
      sortOrder: 0,
      version: 1,
      updatedAt,
    },
  ];
  const writes: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  await page.route('**/api/v1/admin/quick-replies**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'GET') return route.fulfill({ json: { items } });
    const body = method === 'DELETE' ? null : (request.postDataJSON() as Record<string, unknown>);
    writes.push({ method, path, body });
    const id = path.split('/').pop()!;
    if (method === 'POST')
      items = [
        ...items,
        { ...(body as Omit<AdminItem, 'id'>), id: 'a3', sortOrder: 1, version: 1, updatedAt },
      ];
    if (method === 'PATCH')
      items = items.map((item) =>
        item.id === id
          ? { ...item, ...(body as Partial<AdminItem>), version: item.version + 1 }
          : item,
      );
    if (method === 'DELETE') {
      items = items.filter((item) => item.id !== id);
      return route.fulfill({ json: { id } });
    }
    return route.fulfill({ status: method === 'POST' ? 201 : 200, json: { items } });
  });

  await page.goto(`${ADMIN}/`);
  await page.getByRole('navigation').getByRole('button', { name: 'Jawaban Cepat' }).click();
  await expect(page).toHaveURL(/\/quick-replies$/);
  await expect(page.getByText('Terima kasih.')).toBeVisible();

  await page.getByRole('button', { name: /Selesaikan Voice/ }).click();
  await expect(page.getByText('Selesai.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah jawaban cepat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah jawaban cepat' });
  const save = dialog.getByRole('button', { name: 'Simpan' });
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Nama').fill('Kondisi normal');
  await dialog.getByLabel('Isi').fill('Kondisi sudah kembali normal.');
  await save.click();
  await expect(dialog).toBeHidden();
  expect(writes[0]).toMatchObject({
    method: 'POST',
    body: {
      placement: 'CLOSE',
      label: 'Kondisi normal',
      text: 'Kondisi sudah kembali normal.',
      active: true,
    },
  });
  const preview = page.locator('.qrset__chips');
  await expect(preview).toContainText('Kondisi normal');

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Sudah diperbaiki' })
    .getByRole('switch')
    .click();
  await expect.poll(() => writes[1]?.body).toMatchObject({ active: false, expectedVersion: 1 });
  await expect(preview).not.toContainText('Sudah diperbaiki');

  await page.getByRole('button', { name: 'Hapus Kondisi normal' }).click();
  await page.getByRole('dialog', { name: /Hapus/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect
    .poll(() => writes[2])
    .toMatchObject({ method: 'DELETE', path: '/api/v1/admin/quick-replies/a3' });
});
