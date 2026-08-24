import { afterEach, describe, expect, it } from 'vitest';
import { AttachmentPurpose, AttachmentState, Role } from '@prisma/client';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { MediaService } from '../../src/media/media.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { resetConfigForTests } from '../../src/config';

const roots: string[] = [];
afterEach(async () => {
  resetConfigForTests();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function configure(root: string) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
    MEDIA_ROOT: root,
    SESSION_HASH_SECRET: 'a'.repeat(32),
    SESSION_CSRF_SECRET: 'b'.repeat(32),
    AUTH_THROTTLE_SECRET: 'c'.repeat(32),
    CURSOR_SIGNING_SECRET: 'd'.repeat(32),
    PUSH_ENDPOINT_HOSTS: 'fcm.googleapis.com',
  });
  resetConfigForTests();
}

describe('media and push security boundaries', () => {
  it('rejects MIME/signature disagreement and marks the staged record orphaned', async () => {
    const root = await mkdtemp(join(tmpdir(), 'care-media-'));
    roots.push(root);
    configure(root);
    const updates: AttachmentState[] = [];
    const prisma = {
      attachment: {
        create: async () => ({ id: 'attachment-id' }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data.state as AttachmentState);
          return { id: 'attachment-id', ...data };
        },
      },
    };
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const service = new MediaService(prisma as any);
    await expect(
      service.process(
        { buffer: png, size: png.length, mimetype: 'image/jpeg' } as Express.Multer.File,
        'account-id',
        AttachmentPurpose.VOICE,
        {},
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_SIGNATURE_MISMATCH' });
    expect(updates).toContain(AttachmentState.ORPHANED);
  });

  it('re-encodes accepted images to metadata-free WebP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'care-media-'));
    roots.push(root);
    configure(root);
    let stored: Record<string, unknown> = {};
    const prisma = {
      attachment: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          stored = data;
          return { id: 'attachment-id', ...data };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          stored = { ...stored, ...data };
          return { id: 'attachment-id', storageKey: stored.storageKey, ...stored };
        },
      },
    };
    const input = await sharp({
      create: { width: 3, height: 3, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const service = new MediaService(prisma as any);
    const result = await service.process(
      { buffer: input, size: input.length, mimetype: 'image/jpeg' } as Express.Multer.File,
      'account-id',
      AttachmentPurpose.VOICE,
      {},
    );
    expect(result.state).toBe(AttachmentState.READY);
    const files = await readFile(join(root, 'objects', result.storageKey));
    const metadata = await sharp(files).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.orientation).toBeUndefined();
    expect(stored.mimeType).toBe('image/webp');
  });

  it('rejects non-allowlisted push endpoints before persistence', async () => {
    configure('/tmp/care-unused');
    const service = new NotificationsService({} as any);
    await expect(
      service.subscribe(
        {
          accountId: 'account',
          sessionId: 'session',
          role: Role.MEMBER,
        } as any,
        {
          installationId: 'phone',
          endpoint: 'https://127.0.0.1/internal',
          keys: { p256dh: 'p'.repeat(30), auth: 'a'.repeat(20) },
        },
      ),
    ).rejects.toMatchObject({ code: 'PUSH_ENDPOINT_NOT_ALLOWED' });
  });
});
