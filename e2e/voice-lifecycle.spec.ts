import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

for (const width of [360, 390, 768, 1440]) {
  test(`respond with an opening message then set a calendar target at ${width}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/(respond|proceed)$/.test(new URL(request.url()).pathname)
      )
        mutations.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
    });
    await mockWorkforceApi(page, {
      session: memberSession({
        capabilities: ['MEMBER', 'MANAGER'],
        structuralPosition: 'Department Head',
      }),
      voice: {
        id: 'lifecycle-voice',
        displayId: 'CARE-202609-000090',
        visibility: 'GENERAL',
        status: 'OPEN',
        area: 'KARAWANG_1',
        title: 'Perbaikan penerangan',
        detail: 'Lampu di area kerja perlu diperbaiki.',
        availableActions: ['RESPOND', 'ASSIGN', 'HANDOVER'],
      },
    });
    await page.goto('/voices/lifecycle-voice');
    expect(mutations).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Proses Voice', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Handover', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Respons', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Respons' });
    await expect(dialog.getByRole('radio')).toHaveText([
      'Balas pesan',
      'Tugaskan PIC',
      'Handover',
      'Proses sendiri',
    ]);
    await expect(dialog.getByRole('radio', { name: 'Balas pesan' })).toBeChecked();
    const submit = dialog.getByRole('button', { name: 'Balas pesan', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Pesan' }).fill('   ');
    await expect(submit).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'Pesan' })
      .fill('Tim akan memeriksa lampu pada shift pagi.');
    await expect(submit).toBeInViewport();
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
    ).toEqual([]);
    await submit.click();
    await expect(page).toHaveURL(/\/voices\/lifecycle-voice\/chat$/);
    await expect(page.getByText('Tim akan memeriksa lampu pada shift pagi.')).toBeVisible();
    expect(mutations[0]?.body.text).toBe('Tim akan memeriksa lampu pada shift pagi.');
    await page.goto('/voices/lifecycle-voice');
    await expect(page.locator('[aria-current="step"]')).toHaveText('Direspons');
    await page.getByRole('button', { name: 'Proses Voice', exact: true }).click();
    const target = page.getByRole('dialog', { name: 'Mulai penanganan' });
    await expect(target.getByRole('button', { name: 'Mulai diproses' })).toBeDisabled();
    await target.getByRole('button', { name: 'Hari ini', exact: true }).click();
    await expect(target.locator('.target-preview')).toContainText('WIB');
    await target.getByRole('button', { name: 'Mulai diproses' }).click();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Diproses');
    await expect(page.getByRole('region', { name: 'Target penyelesaian' })).toContainText('WIB');
    expect(mutations.map((item) => item.path.split('/').at(-1))).toEqual(['respond', 'proceed']);
    expect(mutations[1]?.body.days).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('Respons sheet processes in one step or leads to handover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/respond$/.test(new URL(request.url()).pathname))
      requests.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'sheet-voice',
      displayId: 'CARE-202610-000002',
      visibility: 'GENERAL',
      status: 'OPEN',
      area: 'KARAWANG_1',
      title: 'Kran air bocor',
      detail: 'Kran di area istirahat bocor.',
      availableActions: ['RESPOND', 'ASSIGN', 'HANDOVER'],
    },
  });
  await page.goto('/voices/sheet-voice');
  await page.getByRole('button', { name: 'Respons', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Respons' });
  await sheet.getByRole('radio', { name: 'Handover' }).click();
  await expect(sheet.getByRole('textbox', { name: 'Pesan' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Handover', exact: true }).click();
  await expect(page).toHaveURL(/\/voices\/sheet-voice\/handover$/);
  await page.goto('/voices/sheet-voice');
  await page.getByRole('button', { name: 'Respons', exact: true }).click();
  await sheet.getByRole('radio', { name: 'Proses sendiri' }).click();
  const submit = sheet.getByRole('button', { name: 'Proses sendiri', exact: true });
  await sheet.getByRole('textbox', { name: 'Pesan' }).fill('Saya cek langsung siang ini.');
  await expect(submit).toBeDisabled();
  await sheet.getByRole('button', { name: '3 hari', exact: true }).click();
  await expect(sheet.locator('.target-preview')).toContainText('WIB');
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await submit.click();
  await expect(page).toHaveURL(/\/voices\/sheet-voice\/chat$/);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.body).toMatchObject({ text: 'Saya cek langsung siang ini.', days: 3 });
});

test('a Group Leader holding a tiered Voice answers or processes it, and outsiders are badged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'GROUP_LEADER'] }),
    voice: {
      id: 'tier-voice',
      displayId: 'CARE-202610-000007',
      visibility: 'GENERAL',
      status: 'OPEN',
      area: 'KARAWANG_1',
      title: 'Insentif kehadiran belum dibayar',
      detail: 'Insentif kehadiran bulan lalu belum dibayarkan.',
      tierLevel: 'GROUP_LEADER',
      outsideReporter: true,
      availableActions: ['RESPOND'],
    },
  });
  await page.goto('/voices/tier-voice');
  await expect(page.locator('.voice-hero').getByText('Pelapor dari luar department')).toBeVisible();
  await page.getByRole('button', { name: 'Respons', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Respons' }).getByRole('radio')).toHaveText([
    'Balas pesan',
    'Proses sendiri',
  ]);
});

test('a Group Leader sends an open Voice up with a reason', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const sent: Record<string, unknown>[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/escalate'))
      sent.push(request.postDataJSON() as Record<string, unknown>);
  });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'GROUP_LEADER'] }),
    voice: {
      id: 'up-voice',
      displayId: 'CARE-202610-000008',
      visibility: 'GENERAL',
      status: 'OPEN',
      area: 'KARAWANG_1',
      title: 'Jadwal lembur tidak adil',
      detail: 'Pembagian lembur di line kami tidak merata.',
      tierLevel: 'GROUP_LEADER',
      availableActions: ['RESPOND', 'ESCALATE'],
    },
  });
  await page.goto('/voices/up-voice');
  await page.getByRole('button', { name: 'Respons', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Respons' });
  await expect(sheet.getByRole('radio')).toHaveText([
    'Balas pesan',
    'Naikkan ke atasan',
    'Proses sendiri',
  ]);
  await sheet.getByRole('radio', { name: 'Naikkan ke atasan' }).click();
  const submit = sheet.getByRole('button', { name: 'Naikkan ke atasan', exact: true });
  await expect(submit).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Alasan' }).fill('Perlu keputusan Section Head.');
  await submit.click();
  await expect(page.getByText('Voice dinaikkan ke atasan.')).toBeVisible();
  expect(sent[0]).toMatchObject({ reason: 'Perlu keputusan Section Head.' });
});

test('an upper tier reminds the holder below after an answered Voice went up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  let reminded = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/remind'))
      reminded += 1;
  });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'SECTION_HEAD'] }),
    voice: {
      id: 'remind-voice',
      displayId: 'CARE-202610-000009',
      visibility: 'GENERAL',
      status: 'RESPONDED',
      area: 'KARAWANG_1',
      title: 'Jadwal lembur tidak adil',
      detail: 'Pembagian lembur di line kami tidak merata.',
      tierLevel: 'SECTION_HEAD',
      availableActions: ['PROCEED', 'ASSIGN', 'REMIND', 'MESSAGE'],
    },
  });
  await page.goto('/voices/remind-voice');
  await expect(page.getByRole('button', { name: 'Naikkan', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ingatkan', exact: true }).click();
  await expect(page.getByText('Pengingat terkirim.')).toBeVisible();
  expect(reminded).toBe(1);
});

test('upper levels follow a team Voice through its stages and a large chat collapses to avatars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
    voice: {
      id: 'stage-voice',
      displayId: 'CARE-202610-000010',
      visibility: 'GENERAL',
      status: 'RESPONDED',
      area: 'KARAWANG_1',
      title: 'Jadwal lembur tidak adil',
      detail: 'Pembagian lembur di line kami tidak merata.',
      tierLevel: 'SECTION_HEAD',
      availableActions: [],
      conversationState: 'READ_ONLY',
      tierStages: [
        { level: 'GROUP_LEADER', state: 'DONE', names: ['Budi Santoso'] },
        { level: 'SECTION_HEAD', state: 'CURRENT', names: ['Rahmat Hidayat'] },
        { level: 'MANAGER', state: 'NEXT', names: ['Dedi Slamet'] },
        { level: 'DIVISION', state: 'NEXT', names: ['Ani Wijaya', 'Joko Purnomo'] },
      ],
      participants: [
        { id: 'r', displayName: 'Sari Dewi', role: 'REPORTER' },
        { id: 'g', displayName: 'Budi Santoso', role: 'GROUP_LEADER' },
        { id: 's', displayName: 'Rahmat Hidayat', role: 'SECTION_HEAD' },
        { id: 'm', displayName: 'Dedi Slamet', role: 'DEPARTMENT_HEAD' },
        { id: 'd1', displayName: 'Ani Wijaya', role: 'DIVISION_LEADER' },
        { id: 'd2', displayName: 'Joko Purnomo', role: 'DIVISION_LEADER' },
      ],
    },
  });
  await page.goto('/voices/stage-voice');
  const stages = page.getByRole('list', { name: 'Tahap penanganan' });
  await expect(stages.getByRole('listitem')).toHaveCount(4);
  await expect(stages.locator('[data-state="CURRENT"]')).toContainText('Rahmat Hidayat');
  await expect(stages.locator('[data-state="DONE"]')).toContainText('Group Leader');
  await page.goto('/voices/stage-voice/chat');
  const people = page.getByRole('button', { name: 'Lihat peserta percakapan' });
  await expect(people.locator('.chat-avatars .chat-participant__avatar')).toHaveCount(5);
  await expect(people.getByText('+1')).toBeVisible();
  await expect(people.getByText('Detail')).toBeVisible();
  await people.click();
  await expect(
    page.getByRole('dialog', { name: 'Peserta percakapan' }).getByRole('listitem'),
  ).toHaveCount(6);
});

test('an overdue target is flagged on the work card, the detail, and in the chat', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'overdue-voice',
      displayId: 'CARE-202610-000005',
      visibility: 'GENERAL',
      status: 'IN_PROGRESS',
      area: 'KARAWANG_1',
      title: 'Lampu gudang mati',
      detail: 'Lampu di gudang belakang mati.',
      availableActions: ['MESSAGE', 'CLOSE'],
      targetOverdue: true,
      handlingTargets: [
        {
          id: 'target-overdue',
          cycleNumber: 1,
          days: 1,
          setAt: '2026-10-01T02:00:00.000Z',
          dueAt: '2026-10-02T16:59:59.999Z',
          state: 'OVERDUE',
        },
      ],
    },
  });
  await page.route('**/api/v1/voices/overdue-voice/messages**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            items: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                text: 'Target penyelesaian terlewati',
                kind: 'SYSTEM',
                createdAt: '2026-10-03T00:00:00.000Z',
                senderId: 'handler-1',
                senderAccountKind: 'WORKFORCE',
                sender: { kind: 'WORKFORCE', displayName: 'Manager PIC' },
                attachments: [],
              },
            ],
            nextCursor: null,
          },
        })
      : route.fallback(),
  );
  await page.goto('/work-items');
  const card = page.getByRole('button', { name: 'Buka CARE-202610-000005' });
  await expect(card.getByText('Terlambat')).toBeVisible();
  await card.click();
  await expect(page.locator('.voice-hero').getByText('Terlambat')).toBeVisible();
  await page.goto('/voices/overdue-voice/chat');
  await expect(page.getByRole('note')).toContainText('Target penyelesaian terlewati');
});

test('unread chat badge clears after opening chat and a superior takes over from an inactive PIC', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  });
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'takeover-voice',
      displayId: 'CARE-202610-000001',
      visibility: 'GENERAL',
      status: 'IN_PROGRESS',
      area: 'KARAWANG_1',
      title: 'Kipas angin mati',
      detail: 'Kipas di line 2 tidak berputar.',
      conversationState: 'ACTIVE',
      currentHandler: { id: 'sh-inactive', displayName: 'Budi Santoso' },
      unreadMessages: 3,
      availableActions: ['MESSAGE', 'TAKE_OVER'],
    },
  });
  await page.goto('/voices/takeover-voice');
  await expect(page.getByLabel('3 pesan belum dibaca')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Selesaikan', exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ambil alih' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ambil alih Voice ini?' });
  await dialog.getByRole('button', { name: 'Ambil alih' }).click();
  await expect(page.getByText('Anda sekarang PIC Voice ini.')).toBeVisible();
  expect(posts).toContain('/api/v1/voices/takeover-voice/take-over');
  await page.getByText('Buka Chat').click();
  await expect(page).toHaveURL(/\/voices\/takeover-voice\/chat$/);
  await expect.poll(() => posts).toContain('/api/v1/voices/takeover-voice/conversation/read');
  await page.goto('/voices/takeover-voice');
  await expect(page.getByLabel('3 pesan belum dibaca')).toHaveCount(0);
});

test('processing failure retains the target and retries with the same idempotency key', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'retry-voice',
      displayId: 'CARE-202609-000092',
      visibility: 'GENERAL',
      status: 'RESPONDED',
      area: 'KARAWANG_1',
      title: 'Retry process',
      detail: 'Detail',
      availableActions: ['PROCEED'],
    },
  });
  const keys: string[] = [];
  let attempt = 0;
  await page.route('**/api/v1/voices/retry-voice/proceed', async (route) => {
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (++attempt === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Layanan sementara tidak tersedia.' }),
      });
    return route.fallback();
  });
  await page.goto('/voices/retry-voice');
  await page.getByRole('button', { name: 'Proses Voice', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: 'Target penyelesaian (hari)' }).fill('3');
  await dialog.getByRole('button', { name: 'Mulai diproses' }).click();
  await expect(dialog.getByText('Target belum tersimpan')).toBeVisible();
  await expect(dialog.getByRole('spinbutton')).toHaveValue('3');
  await dialog.getByRole('button', { name: 'Mulai diproses' }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Diproses');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
});

test('reassign uses its own audited endpoint and retains the existing room', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'MANAGER'],
      structuralPosition: 'Department Head',
    }),
    voice: {
      id: 'reassign-voice',
      displayId: 'CARE-202609-000093',
      visibility: 'GENERAL',
      status: 'RESPONDED',
      area: 'KARAWANG_1',
      title: 'Assigned Voice',
      detail: 'Detail',
      availableActions: ['REASSIGN'],
    },
    assignmentCandidates: [{ id: 'section-1', displayName: 'Section Head Satu', activeCount: 1 }],
  });
  await page.goto('/voices/reassign-voice');
  await expect(page.getByRole('button', { name: 'Proses Voice', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ganti PIC' }).click();
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: /Section Head Satu/ })
    .click();
  const request = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/assignments/reassign'),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Tugaskan' }).click();
  expect((await request).postDataJSON()).toMatchObject({ handlerAccountId: 'section-1' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/voices\/reassign-voice$/);
});

test('cancelling the assignment note leaves assignment and response untouched', async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/assignments'))
      mutations.push(request.url());
  });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
    voice: {
      id: 'cancel-assignment',
      displayId: 'CARE-202609-000099',
      visibility: 'GENERAL',
      status: 'OPEN',
      area: 'KARAWANG_1',
      title: 'Assignment',
      detail: 'Detail',
      availableActions: ['RESPOND', 'ASSIGN'],
    },
    assignmentCandidates: [{ id: 'section-1', displayName: 'Section Head Satu', activeCount: 0 }],
  });
  await page.goto('/voices/cancel-assignment');
  await page.getByRole('button', { name: 'Respons', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Respons' });
  await sheet.getByRole('radio', { name: 'Tugaskan PIC' }).click();
  await sheet.getByRole('radio', { name: /Section Head Satu/ }).click();
  const submit = sheet.getByRole('button', { name: 'Tugaskan PIC', exact: true });
  await expect(submit).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Pesan' }).fill('Mohon dicek.');
  await expect(submit).toBeEnabled();
  expect(mutations).toHaveLength(0);
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Terbuka');
  expect(mutations).toHaveLength(0);
});

for (const width of [360, 768, 1440]) {
  test(`three chat participants expose full names and preserve failed drafts at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkforceApi(page, {
      voice: {
        id: 'three-chat',
        displayId: 'CARE-202609-000100',
        visibility: 'GENERAL',
        status: 'RESPONDED',
        area: 'KARAWANG_1',
        title: 'Percakapan penanganan',
        detail: 'Detail',
        availableActions: ['MESSAGE'],
        participants: [
          { id: 'reporter', displayName: 'Budi Santoso', role: 'REPORTER' },
          { id: 'owner', displayName: 'Muhammad Rizky Pratama', role: 'DEPARTMENT_HEAD' },
          { id: 'handler', displayName: 'Agus Setiawan', role: 'SECTION_HEAD' },
        ],
      },
    });
    await page.goto('/voices/three-chat/chat');
    await expect(page.locator('.chat-participant')).toHaveCount(3);
    await expect(page.locator('.chat-participants')).toContainText('Muhammad Rizky Pratama');
    await page.getByRole('button', { name: 'Lihat peserta percakapan' }).click();
    await expect(page.getByRole('dialog')).toContainText('Muhammad Rizky Pratama');
    await page.keyboard.press('Escape');
    await page.route('**/voices/three-chat/messages', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Coba lagi.' } })
        : route.fallback(),
    );
    await page.getByRole('textbox', { name: 'Pesan', exact: true }).fill('Draft tetap tersimpan');
    await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click();
    await expect(page.getByText('Pesan gagal dikirim')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Pesan', exact: true })).toHaveValue(
      'Draft tetap tersimpan',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
