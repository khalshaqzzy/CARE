import type { INestApplication } from '@nestjs/common';
import { AccountKind, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';

const db = new PrismaClient();
let app: INestApplication;
const cookies: Record<string, string[]> = {};
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');

const http = () => request(app.getHttpServer());
const login = async (username: string) =>
  http()
    .post('/api/v1/auth/login')
    .send({ username, password: 'secret-pass' })
    .expect(201)
    .then((response) => response.headers['set-cookie'] as unknown as string[]);
const csrf = async (session: string[]) =>
  (await http().get('/api/v1/auth/csrf').set('Cookie', session).expect(200)).body.token as string;
const upload = async (
  title: string,
  audience: { forMember: boolean; forResponder: boolean },
  file = PDF,
) =>
  http()
    .post('/api/v1/admin/guides')
    .set('Cookie', cookies.admin!)
    .set('X-CSRF-Token', await csrf(cookies.admin!))
    .field('title', title)
    .field('forMember', String(audience.forMember))
    .field('forResponder', String(audience.forResponder))
    .attach('file', file, { filename: `${title}.pdf`, contentType: 'application/pdf' });
const titlesFor = async (who: string) =>
  (await http().get('/api/v1/guides').set('Cookie', cookies[who]!).expect(200)).body.items.map(
    (item: { title: string }) => item.title,
  );
const guidePath = (storageKey: string | null) =>
  resolve(process.env.MEDIA_ROOT!, 'guides', storageKey!);

describe('Panduan guides', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "Guide", "AuditEvent", "RequestThrottle" CASCADE',
    );
    const snapshot = await db.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'g'.repeat(64), rowCount: 2 },
    });
    const unit = await db.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Divisi A', department: 'Assembly' },
    });
    const passwordHash = await hash('secret-pass');
    for (const [key, position] of [
      ['admin', null],
      ['member', 'Member'],
      ['manager', 'Department Head'],
    ] as const) {
      const employee = position
        ? await db.employee.create({ data: { noReg: `guide-${key}`, name: key } })
        : null;
      await db.userAccount.create({
        data: {
          username: `guide-${key}`,
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
            sourceRow: key === 'member' ? 2 : 3,
          },
        });
      cookies[key] = await login(`guide-${key}`);
    }
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('shows each uploaded guide only to its audience, in admin order', async () => {
    const submit = await upload('Panduan Submit Voice', { forMember: true, forResponder: false });
    expect(submit.status).toBe(201);
    expect(submit.body).toMatchObject({ title: 'Panduan Submit Voice', sortOrder: 0 });
    await upload('Panduan Responder', { forMember: false, forResponder: true }).then((r) =>
      expect(r.status).toBe(201),
    );
    await upload('FAQ', { forMember: true, forResponder: true }).then((r) =>
      expect(r.status).toBe(201),
    );

    expect(await titlesFor('member')).toEqual(['Panduan Submit Voice', 'FAQ']);
    expect(await titlesFor('manager')).toEqual([
      'Panduan Submit Voice',
      'Panduan Responder',
      'FAQ',
    ]);

    const audit = await db.auditEvent.count({ where: { action: 'GUIDE_CREATED' } });
    expect(audit).toBe(3);
  });

  it('serves the PDF without a session so device viewers can open it', async () => {
    const guide = await db.guide.findFirstOrThrow({ where: { title: 'FAQ' } });
    const response = await http().get(`/api/v1/guides/${guide.id}/file`).expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(
      Buffer.from(response.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    await http().get('/api/v1/guides/00000000-0000-4000-8000-000000000000/file').expect(404);
  });

  it('rejects files that are not PDF and a guide with no audience', async () => {
    const notPdf = await upload(
      'Bukan PDF',
      { forMember: true, forResponder: false },
      Buffer.from('hello'),
    );
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.code).toBe('GUIDE_FILE_INVALID');
    const noAudience = await upload('Tanpa target', { forMember: false, forResponder: false });
    expect(noAudience.status).toBe(400);
    expect(await db.guide.count()).toBe(3);
  });

  it('keeps guide management to the CARE Admin', async () => {
    await http().get('/api/v1/admin/guides').set('Cookie', cookies.member!).expect(404);
    await http()
      .post('/api/v1/admin/guides')
      .set('Cookie', cookies.manager!)
      .set('X-CSRF-Token', await csrf(cookies.manager!))
      .field('title', 'X')
      .field('forMember', 'true')
      .field('forResponder', 'false')
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(404);
  });

  it('edits the audience, reorders, replaces the file and deletes', async () => {
    const list = (
      await http().get('/api/v1/admin/guides').set('Cookie', cookies.admin!).expect(200)
    ).body.items as { id: string; title: string }[];
    const [submit, responder, faq] = list;
    const token = await csrf(cookies.admin!);

    await http()
      .patch(`/api/v1/admin/guides/${responder!.id}`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .send({ title: 'Panduan Responder', forMember: true, forResponder: true })
      .expect(200);
    await http()
      .put('/api/v1/admin/guides/order')
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .send({ ids: [faq!.id, submit!.id, responder!.id] })
      .expect(200);
    expect(await titlesFor('member')).toEqual(['FAQ', 'Panduan Submit Voice', 'Panduan Responder']);
    await http()
      .put('/api/v1/admin/guides/order')
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .send({ ids: [faq!.id] })
      .expect(400);

    const before = await db.guide.findUniqueOrThrow({ where: { id: faq!.id } });
    await http()
      .put(`/api/v1/admin/guides/${faq!.id}/file`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .attach('file', Buffer.from('%PDF-1.7\n% versi 2\n%%EOF\n'), {
        filename: 'faq-v2.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    const after = await db.guide.findUniqueOrThrow({ where: { id: faq!.id } });
    expect(after.fileName).toBe('faq-v2.pdf');
    expect(after.storageKey).not.toBe(before.storageKey);
    await expect(access(guidePath(before.storageKey))).rejects.toThrow();
    await access(guidePath(after.storageKey));

    await http()
      .delete(`/api/v1/admin/guides/${faq!.id}`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .expect(200);
    await expect(access(guidePath(after.storageKey))).rejects.toThrow();
    expect(await titlesFor('member')).toEqual(['Panduan Submit Voice', 'Panduan Responder']);
  });

  it('adds a video link that lists with the guides and has no file', async () => {
    const token = await csrf(cookies.admin!);
    const send = (body: Record<string, unknown>) =>
      http()
        .post('/api/v1/admin/guides/videos')
        .set('Cookie', cookies.admin!)
        .set('X-CSRF-Token', token)
        .send(body);
    const audience = { forMember: true, forResponder: false };
    const rejected = await send({ title: 'Video', videoUrl: 'http://youtu.be/abc', ...audience });
    expect(rejected.status).toBe(400);
    const created = await send({
      title: 'Video cara submit Voice',
      videoUrl: 'https://youtu.be/abc',
      ...audience,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'VIDEO', videoUrl: 'https://youtu.be/abc' });

    const items = (await http().get('/api/v1/guides').set('Cookie', cookies.member!).expect(200))
      .body.items as { title: string; kind: string; videoUrl: string | null }[];
    expect(items.at(-1)).toMatchObject({
      title: 'Video cara submit Voice',
      kind: 'VIDEO',
      videoUrl: 'https://youtu.be/abc',
    });
    await http().get(`/api/v1/guides/${created.body.id}/file`).expect(404);
    await http()
      .put(`/api/v1/admin/guides/${created.body.id}/file`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(400);

    await http()
      .patch(`/api/v1/admin/guides/${created.body.id}`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .send({
        title: 'Video submit',
        videoUrl: 'https://drive.google.com/file/d/x/view',
        ...audience,
      })
      .expect(200);
    const pdf = await db.guide.findFirstOrThrow({ where: { kind: 'PDF' } });
    await http()
      .patch(`/api/v1/admin/guides/${pdf.id}`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .send({ title: pdf.title, videoUrl: 'https://youtu.be/abc', ...audience })
      .expect(400);
    await http()
      .delete(`/api/v1/admin/guides/${created.body.id}`)
      .set('Cookie', cookies.admin!)
      .set('X-CSRF-Token', token)
      .expect(200);
  });
});
