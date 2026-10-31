import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { PolicyService } from '../auth/policy.service';
import { randomToken, sha256 } from '../common/crypto';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import { parse } from '../common/validation';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';

export const GUIDE_MAX_BYTES = 20_000_000;

/** Capabilities that handle or approve Voices and therefore read responder guides. */
export const RESPONDER_CAPABILITIES = [
  'GROUP_LEADER',
  'SECTION_HEAD',
  'MANAGER',
  'DIVISION_LEADERSHIP',
  'DIRECTOR',
  'UNION_HEAD',
  'UNION_OFFICER',
];

// Multipart fields arrive as strings.
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const audienceRefine = (value: { forMember?: boolean; forResponder?: boolean }) =>
  value.forMember || value.forResponder;
const audienceIssue = { message: 'Pilih minimal satu: Member atau Responder.', path: ['audience'] };

// Video guides are links to an external player (YouTube, Google Drive, SharePoint).
const videoUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => value.startsWith('https://'), 'Link video harus diawali https://');

const createSchema = z
  .object({ title: z.string().trim().min(1).max(120), forMember: flag, forResponder: flag })
  .strict()
  .refine(audienceRefine, audienceIssue);
const videoSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    videoUrl,
    forMember: z.boolean(),
    forResponder: z.boolean(),
  })
  .strict()
  .refine(audienceRefine, audienceIssue);
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    forMember: z.boolean(),
    forResponder: z.boolean(),
    videoUrl: videoUrl.optional(),
  })
  .strict()
  .refine(audienceRefine, audienceIssue);
const orderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).strict();

const adminSelect = {
  id: true,
  kind: true,
  title: true,
  forMember: true,
  forResponder: true,
  sortOrder: true,
  videoUrl: true,
  fileName: true,
  size: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { displayName: true } },
} satisfies Prisma.GuideSelect;

@Injectable()
export class GuidesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}

  /** Guides for the signed-in workforce or Union account, in admin order. */
  async listForActor(actor: AuthActor) {
    const member = actor.capabilities.includes('MEMBER');
    const responder = actor.capabilities.some((capability) =>
      RESPONDER_CAPABILITIES.includes(capability),
    );
    const audience: Prisma.GuideWhereInput[] = [
      ...(member ? [{ forMember: true }] : []),
      ...(responder ? [{ forResponder: true }] : []),
    ];
    if (!audience.length) return { items: [] };
    const items = await this.prisma.guide.findMany({
      where: { OR: audience },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, kind: true, title: true, videoUrl: true, size: true, updatedAt: true },
    });
    return { items };
  }

  async listAll() {
    const items = await this.prisma.guide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: adminSelect,
    });
    return { items };
  }

  async create(actor: AuthActor, file: Express.Multer.File | undefined, input: unknown) {
    const data = parse(createSchema, input);
    const stored = await this.store(file);
    const last = await this.prisma.guide.aggregate({ _max: { sortOrder: true } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const guide = await tx.guide.create({
          data: {
            ...data,
            ...stored,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            uploadedById: actor.accountId,
          },
          select: adminSelect,
        });
        await this.audit(tx, actor, 'GUIDE_CREATED', guide.id, {
          title: guide.title,
          forMember: guide.forMember,
          forResponder: guide.forResponder,
          fileName: guide.fileName,
        });
        return guide;
      });
    } catch (error) {
      await this.remove(stored.storageKey);
      throw error;
    }
  }

  async createVideo(actor: AuthActor, input: unknown) {
    const data = parse(videoSchema, input);
    const last = await this.prisma.guide.aggregate({ _max: { sortOrder: true } });
    return this.prisma.$transaction(async (tx) => {
      const guide = await tx.guide.create({
        data: {
          ...data,
          kind: 'VIDEO',
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          uploadedById: actor.accountId,
        },
        select: adminSelect,
      });
      await this.audit(tx, actor, 'GUIDE_CREATED', guide.id, { kind: 'VIDEO', ...data });
      return guide;
    });
  }

  async update(actor: AuthActor, id: string, input: unknown) {
    const data = parse(updateSchema, input);
    const existing = await this.find(id);
    if (data.videoUrl !== undefined && existing.kind !== 'VIDEO')
      throw badRequest('GUIDE_KIND_MISMATCH', 'Link video hanya untuk panduan video.');
    return this.prisma.$transaction(async (tx) => {
      const guide = await tx.guide.update({ where: { id }, data, select: adminSelect });
      await this.audit(tx, actor, 'GUIDE_UPDATED', id, data);
      return guide;
    });
  }

  /** Swaps the PDF behind an existing guide; every account sees the new file at once. */
  async replaceFile(actor: AuthActor, id: string, file: Express.Multer.File | undefined) {
    const previous = await this.find(id);
    if (previous.kind !== 'PDF')
      throw badRequest('GUIDE_KIND_MISMATCH', 'Panduan video tidak memiliki file.');
    const stored = await this.store(file);
    let guide;
    try {
      guide = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.guide.update({
          where: { id },
          data: { ...stored, uploadedById: actor.accountId },
          select: adminSelect,
        });
        await this.audit(tx, actor, 'GUIDE_FILE_REPLACED', id, { fileName: stored.fileName });
        return updated;
      });
    } catch (error) {
      await this.remove(stored.storageKey);
      throw error;
    }
    if (previous.storageKey) await this.remove(previous.storageKey);
    return guide;
  }

  async reorder(actor: AuthActor, input: unknown) {
    const { ids } = parse(orderSchema, input);
    const existing = await this.prisma.guide.findMany({ select: { id: true } });
    const known = new Set(existing.map((guide) => guide.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    )
      throw badRequest(
        'GUIDE_ORDER_INVALID',
        'Urutan harus memuat setiap panduan tepat satu kali.',
      );
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await tx.guide.update({ where: { id }, data: { sortOrder: index } });
      await this.audit(tx, actor, 'GUIDE_REORDERED', null, { ids });
    });
    return this.listAll();
  }

  async delete(actor: AuthActor, id: string) {
    const guide = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.guide.delete({ where: { id } });
      await this.audit(tx, actor, 'GUIDE_DELETED', id, { title: guide.title });
    });
    if (guide.storageKey) await this.remove(guide.storageKey);
    return { id };
  }

  /** The PDF bytes. Guides hold no personal data, so any id that exists is readable. */
  async readFile(id: string) {
    const guide = await this.find(id);
    if (!guide.storageKey) throw forbiddenAsNotFound();
    return { guide, buffer: await readFile(this.path(guide.storageKey)) };
  }

  private async find(id: string) {
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide) throw forbiddenAsNotFound();
    return guide;
  }

  private async store(file: Express.Multer.File | undefined) {
    if (!file || file.size === 0)
      throw badRequest('GUIDE_FILE_REQUIRED', 'Pilih file PDF untuk diupload.');
    if (file.size > GUIDE_MAX_BYTES)
      throw badRequest('GUIDE_FILE_TOO_LARGE', 'Ukuran PDF maksimal 20 MB.');
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-')
      throw badRequest('GUIDE_FILE_INVALID', 'File harus berupa PDF.');
    const storageKey = `${randomToken(24)}.pdf`;
    const path = this.path(storageKey);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, file.buffer, { mode: 0o600, flag: 'wx' });
    return {
      storageKey,
      fileName: (file.originalname || 'panduan.pdf').slice(0, 200),
      size: file.size,
      checksum: sha256(file.buffer),
    };
  }

  private async remove(storageKey: string) {
    await unlink(this.path(storageKey)).catch(() => undefined);
  }

  private path(storageKey: string) {
    const root = resolve(loadConfig().MEDIA_ROOT, 'guides');
    const path = resolve(root, storageKey);
    if (!path.startsWith(`${root}${sep}`)) throw new Error('Unsafe guide path');
    return path;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    action: string,
    resourceId: string | null,
    summary: Prisma.InputJsonValue,
  ) {
    return tx.auditEvent.create({
      data: {
        actorId: actor.accountId,
        ...this.policy.actorSnapshot(actor),
        action,
        result: 'SUCCESS',
        resourceType: 'GUIDE',
        resourceId,
        summary,
        correlationId: `admin:guide:${resourceId ?? 'order'}`,
        releaseSha: loadConfig().RELEASE_SHA,
      },
    });
  }
}
