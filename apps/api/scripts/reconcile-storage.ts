import { AccountStatus, AttachmentState, ImportStatus, PrismaClient } from '@prisma/client';
import { readdir, unlink } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { loadConfig } from '../src/config';

const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');

function safePath(root: string, key: string) {
  const path = resolve(root, key);
  if (!path.startsWith(`${root}${sep}`)) throw new Error('Unsafe maintenance path');
  return path;
}

async function main() {
  const now = new Date();
  const objectRoot = resolve(loadConfig().MEDIA_ROOT, 'objects');
  const importRoot = resolve(loadConfig().MEDIA_ROOT, 'imports');
  const mediaRoot = resolve(loadConfig().MEDIA_ROOT);
  const [attachments, importBatches, expiredDrafts, staleLegacyAccess] = await Promise.all([
    prisma.attachment.findMany({ select: { id: true, storageKey: true, state: true } }),
    prisma.importBatch.findMany({
      select: { id: true, storageKey: true, status: true, expiresAt: true },
    }),
    prisma.voiceDraft.findMany({
      where: { submittedAt: null, expiresAt: { lt: now } },
      select: { id: true, attachments: { select: { id: true, storageKey: true } } },
    }),
    prisma.legacyVoiceAccess.findMany({
      where: { effectiveTo: null, voice: { status: 'CLOSED' } },
      select: { id: true, accountId: true },
    }),
  ]);
  const referenced = new Set(attachments.map((item) => item.storageKey));
  const files = await readdir(objectRoot, { recursive: true, withFileTypes: true }).catch(() => []);
  const unreferencedFiles = files
    .filter((entry) => entry.isFile())
    .map((entry) => relative(objectRoot, resolve(entry.parentPath, entry.name)))
    .filter((key) => !referenced.has(key));
  const orphanedAttachments = attachments.filter((item) => item.state === AttachmentState.ORPHANED);
  const terminalImports = importBatches.filter(
    (batch) =>
      batch.status === ImportStatus.CONFIRMED ||
      batch.status === ImportStatus.FAILED ||
      batch.status === ImportStatus.EXPIRED ||
      (batch.status === ImportStatus.PREVIEWED && batch.expiresAt < now),
  );
  const retainedImportKeys = new Set(
    importBatches
      .filter((batch) => !terminalImports.some((terminal) => terminal.id === batch.id))
      .map((batch) => batch.storageKey.replace(/^imports\//, '')),
  );
  const importFiles = await readdir(importRoot, { recursive: true, withFileTypes: true }).catch(
    () => [],
  );
  const orphanedImportFiles = importFiles
    .filter((entry) => entry.isFile())
    .map((entry) => relative(importRoot, resolve(entry.parentPath, entry.name)))
    .filter((key) => !retainedImportKeys.has(key));

  if (execute) {
    for (const key of unreferencedFiles)
      await unlink(safePath(objectRoot, key)).catch(() => undefined);
    for (const item of orphanedAttachments)
      await unlink(safePath(objectRoot, item.storageKey)).catch(() => undefined);
    for (const batch of terminalImports)
      await unlink(safePath(mediaRoot, batch.storageKey)).catch(() => undefined);
    for (const key of orphanedImportFiles)
      await unlink(safePath(importRoot, key)).catch(() => undefined);
    await prisma.$transaction(async (tx) => {
      await tx.importBatch.updateMany({
        where: {
          id: {
            in: terminalImports
              .filter((item) => item.status === ImportStatus.PREVIEWED)
              .map((item) => item.id),
          },
        },
        data: { status: ImportStatus.EXPIRED },
      });
      for (const draft of expiredDrafts) {
        await tx.attachment.updateMany({
          where: { draftId: draft.id },
          data: { draftId: null, state: AttachmentState.ORPHANED },
        });
        await tx.aIClassification.deleteMany({ where: { draftId: draft.id } });
        await tx.locationReviewSnapshot.deleteMany({ where: { draftId: draft.id } });
        await tx.voiceDraft.delete({ where: { id: draft.id } });
      }
      await tx.legacyVoiceAccess.updateMany({
        where: { id: { in: staleLegacyAccess.map((item) => item.id) } },
        data: { effectiveTo: now },
      });
      for (const accountId of new Set(staleLegacyAccess.map((item) => item.accountId))) {
        const remaining = await tx.legacyVoiceAccess.count({
          where: { accountId, effectiveTo: null },
        });
        if (!remaining)
          await tx.userAccount.updateMany({
            where: { id: accountId, status: AccountStatus.LEGACY_HANDLER },
            data: { status: AccountStatus.INACTIVE, deactivatedAt: now },
          });
      }
      await tx.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } });
      await tx.requestThrottle.deleteMany({ where: { expiresAt: { lt: now } } });
      await tx.session.deleteMany({ where: { absoluteExpiresAt: { lt: now } } });
    });
  }

  process.stdout.write(
    `${JSON.stringify({ mode: execute ? 'execute' : 'dry-run', unreferencedFiles: unreferencedFiles.length, orphanedAttachments: orphanedAttachments.length, terminalImports: terminalImports.length, orphanedImportFiles: orphanedImportFiles.length, expiredDrafts: expiredDrafts.length, staleLegacyAccess: staleLegacyAccess.length })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Reconciliation failed'}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
