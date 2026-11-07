import { Injectable } from '@nestjs/common';
import { Prisma, QuickReplyPlacement, type QuickReply } from '@prisma/client';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { PrismaService } from '../prisma.service';

/** Keeps the chip row short enough to scan on a phone. */
export const QUICK_REPLY_LIMIT = 10;

const fields = {
  label: z.string().trim().min(1).max(30),
  text: z.string().trim().min(1).max(500),
  active: z.boolean(),
};
const createSchema = z.object({ placement: z.nativeEnum(QuickReplyPlacement), ...fields }).strict();
const updateSchema = z
  .object({
    placement: z.nativeEnum(QuickReplyPlacement),
    ...fields,
    expectedVersion: z.number().int().positive(),
  })
  .strict();
const orderSchema = z
  .object({
    placement: z.nativeEnum(QuickReplyPlacement),
    ids: z.array(z.string().uuid()).min(1).max(QUICK_REPLY_LIMIT),
  })
  .strict();

const ORDER: Prisma.QuickReplyOrderByWithRelationInput[] = [
  { placement: 'asc' },
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
];

/**
 * Jawaban Cepat: CARE Admin manages ready-made sentences per responder action;
 * the workforce app shows the active ones as chips that fill the note.
 */
@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active quick replies for the responder app, grouped by placement. */
  async listActive() {
    const rows = await this.prisma.quickReply.findMany({ where: { active: true }, orderBy: ORDER });
    const groups = Object.fromEntries(
      Object.values(QuickReplyPlacement).map((placement) => [
        placement,
        [] as { id: string; label: string; text: string }[],
      ]),
    ) as Record<QuickReplyPlacement, { id: string; label: string; text: string }[]>;
    for (const row of rows)
      groups[row.placement].push({ id: row.id, label: row.label, text: row.text });
    return groups;
  }

  async listAll() {
    const rows = await this.prisma.quickReply.findMany({ orderBy: ORDER });
    return { items: rows.map(serialize) };
  }

  async create(actor: AuthActor, body: unknown) {
    const data = parse(createSchema, body);
    await this.prisma.$transaction(async (tx) => {
      await lockPlacement(tx, data.placement);
      const peers = await tx.quickReply.findMany({
        where: { placement: data.placement },
        select: { sortOrder: true },
      });
      if (peers.length >= QUICK_REPLY_LIMIT)
        throw conflict(
          'QUICK_REPLY_LIMIT',
          `Maksimal ${QUICK_REPLY_LIMIT} jawaban cepat di tempat ini`,
        );
      const row = await uniqueLabel(() =>
        tx.quickReply.create({
          data: {
            ...data,
            sortOrder: Math.max(-1, ...peers.map((peer) => peer.sortOrder)) + 1,
            updatedById: actor.accountId,
          },
        }),
      );
      await audit(tx, actor, 'QUICK_REPLY_CREATED', row.id, summary(row));
    });
    return this.listAll();
  }

  async update(actor: AuthActor, id: string, body: unknown) {
    const { expectedVersion, ...data } = parse(updateSchema, body);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.quickReply.findUnique({ where: { id } });
      if (!current) throw forbiddenAsNotFound();
      const moving = current.placement !== data.placement;
      let sortOrder = current.sortOrder;
      if (moving) {
        await lockPlacement(tx, data.placement);
        const peers = await tx.quickReply.findMany({
          where: { placement: data.placement },
          select: { sortOrder: true },
        });
        if (peers.length >= QUICK_REPLY_LIMIT)
          throw conflict(
            'QUICK_REPLY_LIMIT',
            `Maksimal ${QUICK_REPLY_LIMIT} jawaban cepat di tempat ini`,
          );
        sortOrder = Math.max(-1, ...peers.map((peer) => peer.sortOrder)) + 1;
      }
      const claimed = await uniqueLabel(() =>
        tx.quickReply.updateMany({
          where: { id, version: expectedVersion },
          data: { ...data, sortOrder, version: { increment: 1 }, updatedById: actor.accountId },
        }),
      );
      if (claimed.count !== 1)
        throw conflict('QUICK_REPLY_VERSION_CONFLICT', 'Jawaban cepat telah berubah; muat ulang');
      await audit(tx, actor, 'QUICK_REPLY_UPDATED', id, {
        before: summary(current),
        after: { placement: data.placement, label: data.label, active: data.active },
      });
    });
    return this.listAll();
  }

  async reorder(actor: AuthActor, body: unknown) {
    const data = parse(orderSchema, body);
    await this.prisma.$transaction(async (tx) => {
      await lockPlacement(tx, data.placement);
      const peers = await tx.quickReply.findMany({
        where: { placement: data.placement },
        select: { id: true },
      });
      const known = new Set(peers.map((peer) => peer.id));
      if (
        new Set(data.ids).size !== data.ids.length ||
        data.ids.length !== known.size ||
        data.ids.some((id) => !known.has(id))
      )
        throw conflict('QUICK_REPLY_ORDER_STALE', 'Daftar jawaban cepat telah berubah; muat ulang');
      for (const [index, id] of data.ids.entries())
        await tx.quickReply.update({ where: { id }, data: { sortOrder: index } });
      await audit(tx, actor, 'QUICK_REPLY_REORDERED', data.placement, { ids: data.ids });
    });
    return this.listAll();
  }

  async delete(actor: AuthActor, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.quickReply.findUnique({ where: { id } });
      if (!row) throw forbiddenAsNotFound();
      await tx.quickReply.delete({ where: { id } });
      await audit(tx, actor, 'QUICK_REPLY_DELETED', id, summary(row));
    });
    return { id };
  }
}

function serialize(row: QuickReply) {
  return {
    id: row.id,
    placement: row.placement,
    label: row.label,
    text: row.text,
    active: row.active,
    sortOrder: row.sortOrder,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

const summary = (row: QuickReply) => ({
  placement: row.placement,
  label: row.label,
  active: row.active,
});

function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Request validation failed');
  return parsed.data;
}

/** Serializes writes to one placement so the limit and ordering stay exact. */
function lockPlacement(tx: Prisma.TransactionClient, placement: QuickReplyPlacement) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quick-reply:${placement}`}))`;
}

async function uniqueLabel<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw conflict('QUICK_REPLY_LABEL_TAKEN', 'Nama ini sudah dipakai di tempat yang sama');
    throw error;
  }
}

function audit(
  tx: Prisma.TransactionClient,
  actor: AuthActor,
  action: string,
  resourceId: string,
  details: Prisma.InputJsonValue,
) {
  return tx.auditEvent.create({
    data: {
      actorId: actor.accountId,
      actorAccountKind: actor.accountKind,
      actorStructuralPosition: actor.structuralPosition,
      actorCapabilities: actor.capabilities,
      action,
      result: 'SUCCESS',
      resourceType: 'QUICK_REPLY',
      resourceId,
      summary: details,
      correlationId: crypto.randomUUID(),
      releaseSha: process.env.RELEASE_SHA ?? 'development',
    },
  });
}
