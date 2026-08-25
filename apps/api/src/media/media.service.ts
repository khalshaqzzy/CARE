import { Inject, Injectable } from '@nestjs/common';
import { AttachmentPurpose, AttachmentState } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { randomToken, sha256 } from '../common/crypto';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { AuthActor } from '../auth/auth.types';
import { PolicyService } from '../auth/policy.service';

const accepted = new Set(['image/jpeg', 'image/png', 'image/webp']);
const formatForMime: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}

  async process(
    file: Express.Multer.File,
    uploaderId: string,
    purpose: AttachmentPurpose,
    parent: { draftId?: string; voiceId?: string },
  ) {
    if (!file || file.size > 10_000_000 || !accepted.has(file.mimetype))
      throw badRequest('MEDIA_INVALID', 'Image must be JPEG, PNG, or WebP and at most 10 MB');
    const key = `${new Date().toISOString().slice(0, 7)}/${randomToken(24)}.webp`;
    const attachment = await this.prisma.attachment.create({
      data: {
        ...parent,
        uploaderId,
        purpose,
        state: AttachmentState.STAGED,
        storageKey: key,
        mimeType: file.mimetype,
        size: file.size,
        checksum: sha256(file.buffer),
      },
    });
    let metadata: { format?: string; width?: number; height?: number };
    let output: Buffer;
    try {
      const image = sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: 40_000_000,
        sequentialRead: true,
      });
      metadata = await image.metadata();
      if (metadata.format !== formatForMime[file.mimetype])
        throw badRequest('MEDIA_SIGNATURE_MISMATCH', 'Image content does not match its MIME type');
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width > 10_000 ||
        metadata.height > 10_000
      )
        throw badRequest('MEDIA_DIMENSIONS_INVALID', 'Image dimensions are unsupported');
      output = await image.rotate().webp({ quality: 82, effort: 4 }).toBuffer();
    } catch (error) {
      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: { state: AttachmentState.ORPHANED },
      });
      if (error && typeof error === 'object' && 'code' in error) throw error;
      throw badRequest('MEDIA_DECODE_FAILED', 'Image cannot be decoded');
    }
    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        state: AttachmentState.PROCESSED,
        mimeType: 'image/webp',
        size: output.length,
        width: metadata.width,
        height: metadata.height,
        checksum: sha256(output),
      },
    });
    const root = resolve(loadConfig().MEDIA_ROOT, 'objects');
    const path = this.safePath(root, key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, output, { mode: 0o600, flag: 'wx' });
    return this.prisma.attachment.update({
      where: { id: attachment.id },
      data: { state: AttachmentState.READY, readyAt: new Date() },
    });
  }

  async readAuthorized(id: string, actor: AuthActor) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        draft: true,
        voice: true,
        message: { include: { conversation: { include: { voice: true } } } },
        closure: { include: { voice: true } },
      },
    });
    if (!attachment || attachment.state !== AttachmentState.READY) throw forbiddenAsNotFound();
    const voice =
      attachment.voice ?? attachment.message?.conversation.voice ?? attachment.closure?.voice;
    const draftAllowed = attachment.draft?.reporterId === actor.accountId;
    const scope = await this.policy.detailScope(actor);
    const voiceAllowed = voice
      ? Boolean(
          await this.prisma.voice.findFirst({
            where: { id: voice.id, AND: [scope] },
            select: { id: true },
          }),
        )
      : false;
    if (!draftAllowed && !voiceAllowed) throw forbiddenAsNotFound();
    if (voice?.visibility === 'PRIVATE' && actor.capabilities.includes('CARE_ADMIN'))
      await this.prisma.auditEvent.create({
        data: {
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          action: 'PRIVATE_MEDIA_READ',
          result: 'SUCCESS',
          resourceType: 'ATTACHMENT',
          resourceId: attachment.id,
          summary: { voiceId: voice.id, content: 'redacted' },
          correlationId: `private-media:${attachment.id}`,
          releaseSha: loadConfig().RELEASE_SHA,
        },
      });
    return {
      attachment,
      buffer: await readFile(
        this.safePath(resolve(loadConfig().MEDIA_ROOT, 'objects'), attachment.storageKey),
      ),
    };
  }

  private safePath(root: string, key: string) {
    const path = resolve(root, key);
    if (!path.startsWith(`${root}${sep}`)) throw new Error('Unsafe media path');
    return path;
  }
}
