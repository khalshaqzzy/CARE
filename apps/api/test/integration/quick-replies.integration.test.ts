import type { INestApplication } from '@nestjs/common';
import { AccountKind, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';

const db = new PrismaClient();
let app: INestApplication;
const cookies: Record<string, string[]> = {};

const http = () => request(app.getHttpServer());
const login = async (username: string) =>
  http()
    .post('/api/v1/auth/login')
    .send({ username, password: 'secret-pass' })
    .expect(201)
    .then((response) => response.headers['set-cookie'] as unknown as string[]);
const csrf = async (session: string[]) =>
  (await http().get('/api/v1/auth/csrf').set('Cookie', session).expect(200)).body.token as string;
/** Admin mutation with a fresh CSRF token; `.expect(status)` sends it. */
const as = (
  who: string,
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: object,
) => ({
  expect: async (status: number) => {
    const token = await csrf(cookies[who]!);
    const agent = http();
    const call = agent[method](`/api/v1/admin/quick-replies${path}`)
      .set('Cookie', cookies[who]!)
      .set('X-CSRF-Token', token);
    return (body ? call.send(body) : call).expect(status);
  },
});
type Item = { id: string; placement: string; label: string; version: number; active: boolean };
const adminList = async () =>
  (await http().get('/api/v1/admin/quick-replies').set('Cookie', cookies.admin!).expect(200)).body
    .items as Item[];
const labels = (items: Item[], placement: string) =>
  items.filter((item) => item.placement === placement).map((item) => item.label);

describe('Jawaban Cepat', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "QuickReply", "AuditEvent", "RequestThrottle" CASCADE',
    );
    const snapshot = await db.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'q'.repeat(64), rowCount: 1 },
    });
    const unit = await db.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Divisi A', department: 'Assembly' },
    });
    const passwordHash = await hash('secret-pass');
    for (const [key, position] of [
      ['admin', null],
      ['manager', 'Department Head'],
    ] as const) {
      const employee = position
        ? await db.employee.create({ data: { noReg: `qr-${key}`, name: key } })
        : null;
      await db.userAccount.create({
        data: {
          username: `qr-${key}`,
          displayName: key,
          passwordHash,
          accountKind: position ? AccountKind.WORKFORCE : AccountKind.CARE_ADMIN,
          passwordChangeRequired: false,
          employeeId: employee?.id ?? null,
        },
      });
      if (employee)
        await db.organizationMembership.create({
          data: {
            snapshotId: snapshot.id,
            employeeId: employee.id,
            organizationUnitId: unit.id,
            employeeName: key,
            structuralPosition: position!,
            section: 'Seksi 1',
            sourceRow: 2,
          },
        });
      cookies[key] = await login(`qr-${key}`);
    }
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('lets CARE Admin add, edit, order and remove what responders see', async () => {
    for (const label of ['Diterima', 'Cek lokasi'])
      await as('admin', 'post', '', {
        placement: 'REPLY',
        label,
        text: `${label} — kalimat`,
        active: true,
      }).expect(201);
    await as('admin', 'post', '', {
      placement: 'CLOSE',
      label: 'Sudah diperbaiki',
      text: 'Perbaikan selesai.',
      active: true,
    }).expect(201);

    // Same name in the same place is refused; another place may reuse it.
    const duplicate = await as('admin', 'post', '', {
      placement: 'REPLY',
      label: 'Diterima',
      text: 'x',
      active: true,
    }).expect(409);
    expect(duplicate.body.code).toBe('QUICK_REPLY_LABEL_TAKEN');

    let items = await adminList();
    expect(labels(items, 'REPLY')).toEqual(['Diterima', 'Cek lokasi']);
    const [first, second] = items.filter((item) => item.placement === 'REPLY');

    await as('admin', 'put', '/order', { placement: 'REPLY', ids: [second!.id, first!.id] }).expect(
      200,
    );
    await as('admin', 'patch', `/${first!.id}`, {
      placement: 'REPLY',
      label: 'Diterima',
      text: 'Terima kasih, sudah kami terima.',
      active: false,
      expectedVersion: first!.version,
    }).expect(200);
    const stale = await as('admin', 'patch', `/${first!.id}`, {
      placement: 'REPLY',
      label: 'Diterima',
      text: 'Lama',
      active: true,
      expectedVersion: first!.version,
    }).expect(409);
    expect(stale.body.code).toBe('QUICK_REPLY_VERSION_CONFLICT');

    const groups = (
      await http().get('/api/v1/quick-replies').set('Cookie', cookies.manager!).expect(200)
    ).body;
    // Inactive entries stay in Admin but are hidden from responders.
    expect(groups.REPLY.map((item: { label: string }) => item.label)).toEqual(['Cek lokasi']);
    expect(groups.CLOSE).toEqual([
      expect.objectContaining({ label: 'Sudah diperbaiki', text: 'Perbaikan selesai.' }),
    ]);
    expect(groups.HANDOVER).toEqual([]);

    items = await adminList();
    expect(labels(items, 'REPLY')).toEqual(['Cek lokasi', 'Diterima']);
    await as('admin', 'delete', `/${second!.id}`).expect(200);
    expect(labels(await adminList(), 'REPLY')).toEqual(['Diterima']);
    expect(
      await db.auditEvent.count({ where: { resourceType: 'QUICK_REPLY' } }),
    ).toBeGreaterThanOrEqual(5);
  });

  it('caps each place at ten entries', async () => {
    for (let index = 0; index < 9; index += 1)
      await as('admin', 'post', '', {
        placement: 'ESCALATE',
        label: `Alasan ${index}`,
        text: 'x',
        active: true,
      }).expect(201);
    await as('admin', 'post', '', {
      placement: 'ESCALATE',
      label: 'Alasan 9',
      text: 'x',
      active: true,
    }).expect(201);
    const over = await as('admin', 'post', '', {
      placement: 'ESCALATE',
      label: 'Alasan 10',
      text: 'x',
      active: true,
    }).expect(409);
    expect(over.body.code).toBe('QUICK_REPLY_LIMIT');
  });

  it('keeps the management endpoints for CARE Admin only', async () => {
    await http().get('/api/v1/admin/quick-replies').set('Cookie', cookies.manager!).expect(404);
    await as('manager', 'post', '', {
      placement: 'REPLY',
      label: 'Hai',
      text: 'Hai',
      active: true,
    }).expect(404);
  });
});
