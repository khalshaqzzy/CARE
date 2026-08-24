import { Inject, Injectable } from '@nestjs/common';
import {
  AttachmentPurpose,
  HandlerType,
  NotificationType,
  Prisma,
  Role,
  RoutingCategory,
  Severity,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { CLASSIFICATION_PROMPT_VERSION } from '../ai/prompt';
import type { AuthActor } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { canonicalHash, randomToken, sha256 } from '../common/crypto';
import { badRequest, conflict, forbiddenAsNotFound, invalidTransition } from '../common/errors';
import { parse } from '../common/validation';
import { loadConfig } from '../config';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma.service';

const draftSchema = z.object({
  area: z.enum(['KARAWANG_1', 'KARAWANG_2', 'KARAWANG_3', 'SUNTER_1', 'SUNTER_2']),
  locationDetail: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(150),
  detail: z.string().trim().min(1).max(5000),
  visibility: z.nativeEnum(VoiceVisibility),
  expectedVersion: z.number().int().positive().optional(),
});
const manualSchema = z.object({
  category: z.nativeEnum(RoutingCategory),
  severity: z.nativeEnum(Severity),
  expectedVersion: z.number().int().positive(),
});
const versionSchema = z.object({ expectedVersion: z.number().int().positive() });
const assignSchema = versionSchema.extend({ sectionHeadAccountId: z.string().uuid() });
const askSchema = versionSchema.extend({ message: z.string().trim().min(1).max(4000) });
const messageSchema = z.object({
  text: z.string().trim().max(4000).optional(),
  expectedVersion: z.number().int().positive(),
});
const closeSchema = versionSchema.extend({
  note: z.string().trim().min(1).max(4000),
  evidenceIds: z.array(z.string().uuid()).min(1).max(5),
});
const ratingSchema = versionSchema.extend({
  score: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).optional(),
  reopen: z.boolean().default(false),
});

@Injectable()
export class VoicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}
  async createDraft(actor: AuthActor, input: unknown) {
    this.requireReporter(actor);
    const data = parse(draftSchema, input);
    const department = await this.department(actor);
    const contentHash = this.contentHash(data, department);
    return this.prisma.voiceDraft.create({
      data: {
        reporterId: actor.accountId,
        area: data.area,
        locationDetail: data.locationDetail,
        title: data.title,
        detail: data.detail,
        visibility: data.visibility,
        reporterDepartment: department,
        contentHash,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  }
  async updateDraft(actor: AuthActor, id: string, input: unknown) {
    const data = parse(draftSchema, input);
    if (!data.expectedVersion)
      throw badRequest('EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
    const draft = await this.ownDraft(actor, id);
    if (draft.version !== data.expectedVersion)
      throw conflict('VERSION_CONFLICT', 'Draft version is stale', {
        currentVersion: draft.version,
      });
    const department = await this.department(actor);
    const contentHash = this.contentHash(data, department);
    const changed = contentHash !== draft.contentHash;
    return this.prisma.$transaction(async (tx) => {
      if (changed) await tx.aIClassification.deleteMany({ where: { draftId: id } });
      return tx.voiceDraft.update({
        where: { id, version: data.expectedVersion },
        data: {
          area: data.area,
          locationDetail: data.locationDetail,
          title: data.title,
          detail: data.detail,
          visibility: data.visibility,
          reporterDepartment: department,
          contentHash,
          version: { increment: 1 },
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
    });
  }
  async getDraft(actor: AuthActor, id: string) {
    return this.ownDraft(actor, id, { classification: true, attachments: true });
  }
  async previewDraft(actor: AuthActor, id: string) {
    const draft = await this.prisma.voiceDraft.findFirst({
      where: { id, reporterId: actor.accountId },
      include: { classification: true, attachments: true },
    });
    if (!draft) throw forbiddenAsNotFound();
    if (!draft.classification || draft.classification.contentHash !== draft.contentHash)
      throw badRequest('CLASSIFICATION_REQUIRED', 'Current classification is required');
    const route = await this.prisma.$transaction((tx) =>
      this.resolveRoute(
        tx,
        draft.visibility,
        draft.classification!.category,
        draft.area,
        draft.reporterDepartment,
      ),
    );
    return {
      draft: {
        id: draft.id,
        version: draft.version,
        area: draft.area,
        locationDetail: draft.locationDetail,
        title: draft.title,
        detail: draft.detail,
        visibility: draft.visibility,
      },
      classification: {
        source: draft.classification.source,
        category:
          draft.visibility === VoiceVisibility.PRIVATE ? null : draft.classification.category,
        severity: draft.classification.severity,
        confidence: draft.classification.confidence,
      },
      attachmentCount: draft.attachments.filter((item) => item.state === 'READY').length,
      route: {
        type: draft.visibility === VoiceVisibility.PRIVATE ? 'UNION' : 'MANAGER',
        label: draft.visibility === VoiceVisibility.PRIVATE ? 'Union' : route.displayName,
      },
    };
  }
  async deleteDraft(actor: AuthActor, id: string) {
    const draft = await this.ownDraft(actor, id);
    if (draft.submittedAt) throw conflict('DRAFT_SUBMITTED', 'Submitted draft cannot be deleted');
    await this.prisma.voiceDraft.delete({ where: { id } });
    return { success: true };
  }
  async addDraftAttachment(actor: AuthActor, id: string, file: Express.Multer.File) {
    await this.ownDraft(actor, id);
    const count = await this.prisma.attachment.count({ where: { draftId: id } });
    if (count >= 5) throw badRequest('ATTACHMENT_LIMIT', 'Maximum five draft images');
    return this.media.process(file, actor.accountId, AttachmentPurpose.VOICE, { draftId: id });
  }
  async removeDraftAttachment(actor: AuthActor, draftId: string, attachmentId: string) {
    await this.ownDraft(actor, draftId);
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, draftId, uploaderId: actor.accountId },
    });
    if (!attachment) throw forbiddenAsNotFound();
    await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { state: 'ORPHANED', draftId: null },
    });
    return { success: true };
  }
  async classify(actor: AuthActor, id: string) {
    const draft = await this.ownDraft(actor, id);
    const result = await this.ai.classify({
      area: draft.area,
      department: draft.reporterDepartment,
      title: draft.title,
      detail: draft.detail,
    });
    await this.prisma.aIClassification.deleteMany({ where: { draftId: id } });
    if (result.source === 'AI')
      return this.prisma.aIClassification.create({
        data: {
          draftId: id,
          model: result.model,
          location: result.location,
          promptVersion: result.promptVersion,
          source: 'AI',
          category: result.result.category,
          severity: result.result.severity,
          confidence: result.result.confidence,
          rationaleCode: result.result.rationaleCode,
          contentHash: draft.contentHash,
          responseId: result.responseId,
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
    return {
      source: 'MANUAL_FALLBACK',
      fallbackCode: result.fallbackCode,
      candidate: result.candidate ?? null,
    };
  }
  async manualClassification(actor: AuthActor, id: string, input: unknown) {
    const data = parse(manualSchema, input);
    const draft = await this.ownDraft(actor, id);
    if (draft.version !== data.expectedVersion)
      throw conflict('VERSION_CONFLICT', 'Draft version is stale', {
        currentVersion: draft.version,
      });
    await this.prisma.aIClassification.deleteMany({ where: { draftId: id } });
    return this.prisma.aIClassification.create({
      data: {
        draftId: id,
        model: loadConfig().VERTEX_MODEL,
        location: loadConfig().VERTEX_LOCATION,
        promptVersion: CLASSIFICATION_PROMPT_VERSION,
        source: 'MANUAL_FALLBACK',
        category: data.category,
        severity: data.severity,
        confidence: 0,
        rationaleCode: 'AMBIGUOUS',
        fallbackCode: 'REPORTER_CONFIRMED',
        contentHash: draft.contentHash,
      },
    });
  }
  async submit(actor: AuthActor, id: string, input: unknown, key: string) {
    const { expectedVersion } = parse(versionSchema, input);
    return this.idempotent(actor, `draft:${id}:submit`, key, input, async () =>
      this.prisma.$transaction(
        async (tx) => {
          const draft = await tx.voiceDraft.findFirst({
            where: { id, reporterId: actor.accountId },
            include: { classification: true, attachments: true },
          });
          if (!draft) throw forbiddenAsNotFound();
          if (draft.version !== expectedVersion)
            throw conflict('VERSION_CONFLICT', 'Draft version is stale', {
              currentVersion: draft.version,
            });
          if (draft.submittedAt) throw conflict('DRAFT_SUBMITTED', 'Draft is already submitted');
          if (!draft.classification || draft.classification.contentHash !== draft.contentHash)
            throw badRequest('CLASSIFICATION_REQUIRED', 'Current classification is required');
          if (draft.attachments.some((a) => a.state !== 'READY'))
            throw badRequest('MEDIA_NOT_READY', 'All images must finish processing');
          const route = await this.resolveRoute(
            tx,
            draft.visibility,
            draft.classification.category,
            draft.area,
            draft.reporterDepartment,
          );
          const displayId = await this.nextDisplayId(tx);
          const handlerType =
            draft.visibility === VoiceVisibility.PRIVATE ? HandlerType.UNION : HandlerType.MANAGER;
          const voice = await tx.voice.create({
            data: {
              displayId,
              reporterId: actor.accountId,
              visibility: draft.visibility,
              area: draft.area,
              reporterDepartment: draft.reporterDepartment,
              locationDetail: draft.locationDetail,
              title: draft.title,
              detail: draft.detail,
              category:
                draft.visibility === VoiceVisibility.PRIVATE ? null : draft.classification.category,
              severity: draft.classification.severity,
              routeOwnerId: route.id,
              handlerType,
              anonymousAlias: `Anonymous-${randomToken(6)}`,
            },
          });
          await tx.aIClassification.update({
            where: { id: draft.classification.id },
            data: { draftId: null, voiceId: voice.id },
          });
          await tx.attachment.updateMany({
            where: { draftId: id },
            data: { draftId: null, voiceId: voice.id },
          });
          await tx.voiceDraft.update({
            where: { id },
            data: { submittedAt: new Date(), version: { increment: 1 } },
          });
          await tx.voiceEvent.create({
            data: {
              voiceId: voice.id,
              type: VoiceEventType.SUBMITTED,
              actorId: actor.accountId,
              actorRole: actor.role,
              payload: { status: VoiceStatus.OPEN },
            },
          });
          await this.notify(
            tx,
            route.id,
            voice.id,
            NotificationType.VOICE_SUBMITTED,
            draft.visibility === VoiceVisibility.PRIVATE ? 'Private Voice baru' : 'Voice baru',
            draft.visibility === VoiceVisibility.PRIVATE
              ? 'Ada Private Voice baru'
              : `Voice ${displayId} memerlukan tindak lanjut`,
          );
          return {
            id: voice.id,
            displayId: voice.displayId,
            status: voice.status,
            version: voice.version,
          };
        },
        { isolationLevel: 'Serializable' },
      ),
    );
  }
  async list(
    actor: AuthActor,
    query: {
      cursor?: string;
      status?: VoiceStatus;
      severity?: Severity;
      search?: string;
      limit?: string;
    },
  ) {
    const where = await this.scope(actor);
    const take = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.voice.findMany({
      where: {
        AND: [
          where,
          query.status ? { status: query.status } : {},
          query.severity ? { severity: query.severity } : {},
          query.search
            ? {
                OR: [
                  { displayId: { contains: query.search, mode: 'insensitive' } },
                  { title: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      take: take + 1,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      orderBy: [{ severity: 'desc' }, { submittedAt: 'desc' }, { id: 'desc' }],
    });
    const more = items.length > take;
    return {
      items: items.slice(0, take).map((v) => ({
        id: v.id,
        displayId: v.displayId,
        title: v.title,
        severity: v.severity,
        status: v.status,
        visibility: v.visibility,
        submittedAt: v.submittedAt,
        version: v.version,
      })),
      nextCursor: more && items[take - 1] ? encodeCursor(items[take - 1].id) : null,
    };
  }
  async detail(actor: AuthActor, id: string) {
    const voice = await this.authorizedVoice(actor, id, {
      reporter: { include: { employee: true } },
    });
    return this.serialize(actor, voice);
  }
  async timeline(actor: AuthActor, id: string) {
    const voice = await this.authorizedVoice(actor, id);
    const events = await this.prisma.voiceEvent.findMany({
      where: { voiceId: id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      actor:
        voice.visibility === 'PRIVATE' &&
        e.actorId === voice.reporterId &&
        actor.accountId !== voice.reporterId
          ? voice.anonymousAlias
          : e.actorRole,
      occurredAt: e.occurredAt,
      payload: e.payload,
    }));
  }
  async ask(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(askSchema, input);
    return this.mutateVoice(actor, id, data.expectedVersion, key, input, async (tx, voice) => {
      this.requireResponder(actor, voice);
      if (![VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION].includes(voice.status))
        throw invalidTransition('Reporter can only be asked before progress');
      const conversation = await tx.conversation.upsert({
        where: { voiceId: id },
        update: {},
        create: { voiceId: id },
      });
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: actor.accountId,
          senderRole: actor.role,
          text: data.message,
        },
      });
      await tx.voice.update({
        where: { id },
        data: {
          status: VoiceStatus.IN_VERIFICATION,
          currentHandlerId: actor.accountId,
          version: { increment: 1 },
        },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          type: VoiceEventType.ASKED_REPORTER,
          actorId: actor.accountId,
          actorRole: actor.role,
          payload: {},
        },
      });
      await this.notify(
        tx,
        voice.reporterId,
        id,
        NotificationType.MESSAGE,
        'Pertanyaan baru',
        voice.visibility === 'PRIVATE'
          ? 'Ada pembaruan Private Voice'
          : `Ada pertanyaan untuk ${voice.displayId}`,
      );
      return { status: VoiceStatus.IN_VERIFICATION, version: voice.version + 1 };
    });
  }
  async proceed(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(versionSchema, input);
    return this.mutateVoice(actor, id, data.expectedVersion, key, input, async (tx, voice) => {
      this.requireResponder(actor, voice);
      if (![VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION].includes(voice.status))
        throw invalidTransition('Voice cannot proceed from current status');
      await tx.voice.update({
        where: { id },
        data: {
          status: VoiceStatus.IN_PROGRESS,
          currentHandlerId: actor.accountId,
          version: { increment: 1 },
        },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          type: VoiceEventType.PROCEEDED,
          actorId: actor.accountId,
          actorRole: actor.role,
          payload: {},
        },
      });
      await this.notify(
        tx,
        voice.reporterId,
        id,
        NotificationType.STATUS_CHANGED,
        'Voice diproses',
        voice.visibility === 'PRIVATE'
          ? 'Ada pembaruan Private Voice'
          : `${voice.displayId} sedang diproses`,
      );
      return { status: VoiceStatus.IN_PROGRESS, version: voice.version + 1 };
    });
  }
  async assign(actor: AuthActor, id: string, input: unknown, key: string) {
    return this.assignSectionHead(actor, id, input, key, false);
  }
  async reassign(actor: AuthActor, id: string, input: unknown, key: string) {
    return this.assignSectionHead(actor, id, input, key, true);
  }
  private async assignSectionHead(
    actor: AuthActor,
    id: string,
    input: unknown,
    key: string,
    reassign: boolean,
  ) {
    const data = parse(assignSchema, input);
    return this.mutateVoice(actor, id, data.expectedVersion, key, input, async (tx, voice) => {
      if (
        actor.role !== Role.MANAGER ||
        voice.routeOwnerId !== actor.accountId ||
        voice.visibility !== VoiceVisibility.GENERAL
      )
        throw forbiddenAsNotFound();
      if (voice.status === VoiceStatus.IN_PROGRESS || voice.status === VoiceStatus.CLOSED)
        throw invalidTransition('Assignment is only allowed before progress');
      const currentAssignment = await tx.voiceAssignment.findFirst({
        where: { voiceId: id, endedAt: null },
      });
      if (reassign && (voice.status !== VoiceStatus.IN_VERIFICATION || !currentAssignment))
        throw invalidTransition('Reassignment requires an active assignment in verification');
      if (!reassign && currentAssignment)
        throw conflict('ASSIGNMENT_EXISTS', 'Use the reassign operation for an assigned Voice');
      const target = await tx.userAccount.findUnique({
        where: { id: data.sectionHeadAccountId },
        include: {
          employee: {
            include: { sectionHeads: { where: { active: true, managerId: actor.accountId } } },
          },
        },
      });
      if (
        !target?.active ||
        target.role !== Role.SECTION_HEAD ||
        !target.employee?.sectionHeads.length
      )
        throw forbiddenAsNotFound();
      await tx.voiceAssignment.updateMany({
        where: { voiceId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.voiceAssignment.create({
        data: {
          voiceId: id,
          handlerId: target.id,
          handlerType: HandlerType.SECTION_HEAD,
          actorId: actor.accountId,
        },
      });
      const eventType = reassign ? VoiceEventType.REASSIGNED : VoiceEventType.ASSIGNED;
      await tx.voice.update({
        where: { id },
        data: {
          currentHandlerId: target.id,
          handlerType: HandlerType.SECTION_HEAD,
          status: VoiceStatus.IN_VERIFICATION,
          version: { increment: 1 },
        },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          type: eventType,
          actorId: actor.accountId,
          actorRole: actor.role,
          payload: { handlerRole: Role.SECTION_HEAD },
        },
      });
      await this.notify(
        tx,
        target.id,
        id,
        NotificationType.ASSIGNED,
        'Voice ditugaskan',
        `${voice.displayId} ditugaskan kepada Anda`,
      );
      return { status: VoiceStatus.IN_VERIFICATION, version: voice.version + 1 };
    });
  }
  async addMessage(
    actor: AuthActor,
    id: string,
    input: unknown,
    files: Express.Multer.File[],
    key: string,
  ) {
    const data = parse(messageSchema, input);
    if (!data.text && !files.length)
      throw badRequest('EMPTY_MESSAGE', 'Text or attachment is required');
    if (files.length > 5) throw badRequest('ATTACHMENT_LIMIT', 'Maximum five images per message');
    return this.mutateVoice(
      actor,
      id,
      data.expectedVersion,
      key,
      { ...data, files: files.map((f) => ({ size: f.size, type: f.mimetype })) },
      async (tx, voice) => {
        if (voice.status === VoiceStatus.CLOSED)
          throw invalidTransition('Closed conversation is read-only');
        const conversation = await tx.conversation.upsert({
          where: { voiceId: id },
          update: {},
          create: { voiceId: id },
        });
        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderId: actor.accountId,
            senderRole: actor.role,
            text: data.text,
          },
        });
        for (const file of files) {
          const attachment = await this.media.process(
            file,
            actor.accountId,
            AttachmentPurpose.CHAT,
            {},
          );
          await tx.attachment.update({
            where: { id: attachment.id },
            data: { messageId: message.id },
          });
        }
        await tx.voiceEvent.create({
          data: {
            voiceId: id,
            type: VoiceEventType.MESSAGE_SENT,
            actorId: actor.accountId,
            actorRole: actor.role,
            payload: { attachmentCount: files.length },
          },
        });
        const recipient =
          actor.accountId === voice.reporterId
            ? (voice.currentHandlerId ?? voice.routeOwnerId)
            : voice.reporterId;
        await this.notify(
          tx,
          recipient,
          id,
          NotificationType.MESSAGE,
          'Pesan baru',
          voice.visibility === 'PRIVATE'
            ? 'Ada pembaruan Private Voice'
            : `Pesan baru pada ${voice.displayId}`,
        );
        await tx.voice.update({ where: { id }, data: { version: { increment: 1 } } });
        return { id: message.id, version: voice.version + 1 };
      },
    );
  }
  async messages(actor: AuthActor, id: string) {
    const voice = await this.authorizedVoice(actor, id);
    const conversation = await this.prisma.conversation.findUnique({
      where: { voiceId: id },
      include: {
        messages: {
          include: { attachments: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    return (conversation?.messages ?? []).map((m) => ({
      id: m.id,
      sender:
        voice.visibility === 'PRIVATE' &&
        m.senderId === voice.reporterId &&
        actor.accountId !== voice.reporterId
          ? voice.anonymousAlias
          : m.senderRole,
      text: m.text,
      createdAt: m.createdAt,
      attachments: m.attachments.map((a) => ({ id: a.id, mimeType: a.mimeType, size: a.size })),
    }));
  }
  async conversations(actor: AuthActor) {
    const where = await this.scope(actor);
    const items = await this.prisma.conversation.findMany({
      where: { voice: where },
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        voice: true,
        messages: { take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
    });
    return items.map((item) => ({
      id: item.id,
      voiceId: item.voiceId,
      displayId: item.voice.displayId,
      title: item.voice.visibility === VoiceVisibility.PRIVATE ? 'Private Voice' : item.voice.title,
      status: item.voice.status,
      updatedAt: item.messages[0]?.createdAt ?? item.createdAt,
      hasMessages: Boolean(item.messages.length),
    }));
  }
  async stageEvidence(actor: AuthActor, id: string, file: Express.Multer.File) {
    const voice = await this.authorizedVoice(actor, id);
    this.requireResponder(actor, voice);
    return this.media.process(file, actor.accountId, AttachmentPurpose.CLOSURE_EVIDENCE, {
      voiceId: id,
    });
  }
  async close(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(closeSchema, input);
    return this.mutateVoice(actor, id, data.expectedVersion, key, input, async (tx, voice) => {
      this.requireResponder(actor, voice);
      if (voice.status !== VoiceStatus.IN_PROGRESS)
        throw invalidTransition('Only In Progress Voice can be closed');
      const evidence = await tx.attachment.findMany({
        where: {
          id: { in: data.evidenceIds },
          voiceId: id,
          purpose: AttachmentPurpose.CLOSURE_EVIDENCE,
          state: 'READY',
          uploaderId: actor.accountId,
        },
      });
      if (evidence.length !== data.evidenceIds.length)
        throw badRequest('EVIDENCE_INVALID', 'All evidence must be ready and owned by the closer');
      const count = await tx.closureCycle.count({ where: { voiceId: id } });
      const cycle = await tx.closureCycle.create({
        data: { voiceId: id, cycleNumber: count + 1, actorId: actor.accountId, note: data.note },
      });
      await tx.attachment.updateMany({
        where: { id: { in: data.evidenceIds } },
        data: { voiceId: null, closureId: cycle.id },
      });
      await tx.voice.update({
        where: { id },
        data: { status: VoiceStatus.CLOSED, version: { increment: 1 } },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          type: VoiceEventType.CLOSED,
          actorId: actor.accountId,
          actorRole: actor.role,
          payload: { cycleNumber: count + 1 },
        },
      });
      await this.notify(
        tx,
        voice.reporterId,
        id,
        NotificationType.CLOSED,
        'Voice selesai',
        voice.visibility === 'PRIVATE'
          ? 'Private Voice telah ditutup'
          : `${voice.displayId} telah ditutup`,
      );
      return { status: VoiceStatus.CLOSED, version: voice.version + 1, closureCycleId: cycle.id };
    });
  }
  async rate(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(ratingSchema, input);
    return this.mutateVoice(actor, id, data.expectedVersion, key, input, async (tx, voice) => {
      if (voice.reporterId !== actor.accountId) throw forbiddenAsNotFound();
      if (voice.status !== VoiceStatus.CLOSED)
        throw invalidTransition('Only a Closed Voice can be rated');
      if (data.score <= 2 && !data.feedback)
        throw badRequest('FEEDBACK_REQUIRED', 'Feedback is required for rating 1–2');
      if (data.score >= 3 && data.reopen)
        throw badRequest('REOPEN_NOT_ALLOWED', 'Only rating 1–2 can reopen');
      const cycle = await tx.closureCycle.findFirst({
        where: { voiceId: id },
        orderBy: { cycleNumber: 'desc' },
        include: { rating: true },
      });
      if (!cycle || cycle.rating)
        throw conflict('RATING_EXISTS', 'Current closure cycle is already rated');
      if (data.reopen) {
        const handler = voice.currentHandlerId
          ? await tx.userAccount.findUnique({ where: { id: voice.currentHandlerId } })
          : null;
        if (handler && !handler.active)
          throw conflict('PIC_INACTIVE', 'Previous PIC is inactive; Admin remediation is required');
      }
      const rating = await tx.rating.create({
        data: {
          closureCycleId: cycle.id,
          reporterId: actor.accountId,
          score: data.score,
          feedback: data.feedback,
          reopen: data.reopen,
        },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          type: VoiceEventType.RATED,
          actorId: actor.accountId,
          actorRole: actor.role,
          payload: { score: data.score },
        },
      });
      if (data.reopen) {
        await tx.closureCycle.update({ where: { id: cycle.id }, data: { reopenedAt: new Date() } });
        await tx.voice.update({
          where: { id },
          data: { status: VoiceStatus.IN_VERIFICATION, version: { increment: 1 } },
        });
        await tx.voiceEvent.create({
          data: {
            voiceId: id,
            type: VoiceEventType.REOPENED,
            actorId: actor.accountId,
            actorRole: actor.role,
            payload: { cycleNumber: cycle.cycleNumber },
          },
        });
        await this.notify(
          tx,
          voice.currentHandlerId ?? voice.routeOwnerId,
          id,
          NotificationType.REOPENED,
          'Voice dibuka kembali',
          voice.visibility === 'PRIVATE'
            ? 'Private Voice dibuka kembali'
            : `${voice.displayId} dibuka kembali`,
        );
      } else await tx.voice.update({ where: { id }, data: { version: { increment: 1 } } });
      return {
        ratingId: rating.id,
        status: data.reopen ? VoiceStatus.IN_VERIFICATION : VoiceStatus.CLOSED,
        version: voice.version + 1,
      };
    });
  }
  async dashboard(actor: AuthActor) {
    const where = await this.scope(actor);
    const [total, statuses, severities, recent] = await Promise.all([
      this.prisma.voice.count({ where }),
      this.prisma.voice.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.voice.groupBy({ by: ['severity'], where, _count: true }),
      this.prisma.voice.findMany({
        where,
        take: 10,
        orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(statuses.map((s) => [s.status, s._count])),
      bySeverity: Object.fromEntries(severities.map((s) => [s.severity, s._count])),
      recent: recent.map((v) => ({
        id: v.id,
        displayId: v.displayId,
        title: v.title,
        severity: v.severity,
        status: v.status,
        updatedAt: v.updatedAt,
      })),
    };
  }
  private requireReporter(actor: AuthActor) {
    if (![Role.MEMBER, Role.MANAGER, Role.SECTION_HEAD].includes(actor.role as any))
      throw forbiddenAsNotFound();
  }
  private async department(actor: AuthActor) {
    const employee = actor.employeeId
      ? await this.prisma.employee.findUnique({ where: { id: actor.employeeId } })
      : null;
    if (!employee?.active) throw forbiddenAsNotFound();
    return employee.department;
  }
  private contentHash(
    data: { area: string; title: string; detail: string; visibility: string },
    department: string,
  ) {
    return sha256(
      JSON.stringify({
        area: data.area,
        title: data.title.trim(),
        detail: data.detail.trim(),
        visibility: data.visibility,
        department,
      }),
    );
  }
  private ownDraft(actor: AuthActor, id: string, include?: Prisma.VoiceDraftInclude) {
    return this.prisma.voiceDraft
      .findFirst({ where: { id, reporterId: actor.accountId }, include })
      .then((value) => {
        if (!value) throw forbiddenAsNotFound();
        return value;
      });
  }
  private async resolveRoute(
    tx: Prisma.TransactionClient,
    visibility: VoiceVisibility,
    category: RoutingCategory,
    area: string,
    department: string,
  ) {
    if (visibility === VoiceVisibility.PRIVATE) {
      const unions = await tx.userAccount.findMany({ where: { role: Role.UNION, active: true } });
      if (unions.length !== 1)
        throw conflict(
          unions.length ? 'ROUTE_AMBIGUOUS' : 'ROUTE_UNAVAILABLE',
          'Exactly one active Union route is required',
        );
      return unions[0]!;
    }
    const profiles = await tx.managerProfile.findMany({
      where: {
        active: true,
        ...(category === RoutingCategory.SAFETY
          ? { area: area as any, isSafety: true }
          : category === RoutingCategory.FACILITY
            ? { area: area as any, isFacility: true }
            : { department, isSafety: false, isFacility: false }),
        account: { active: true },
      },
      include: { account: true },
    });
    if (profiles.length !== 1)
      throw conflict(
        profiles.length ? 'ROUTE_AMBIGUOUS' : 'ROUTE_UNAVAILABLE',
        'Exactly one Manager route is required',
      );
    return profiles[0]!.account;
  }
  private async nextDisplayId(tx: Prisma.TransactionClient) {
    const period = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
    })
      .format(new Date())
      .replace('-', '');
    const seq = await tx.humanVoiceSequence.upsert({
      where: { period },
      update: { value: { increment: 1 } },
      create: { period, value: 1 },
    });
    return `CARE-${period}-${String(seq.value).padStart(6, '0')}`;
  }
  private async scope(actor: AuthActor): Promise<Prisma.VoiceWhereInput> {
    if (actor.role === Role.CARE_ADMIN) return {};
    if (actor.role === Role.UNION)
      return { visibility: VoiceVisibility.PRIVATE, routeOwnerId: actor.accountId };
    if (actor.role === Role.MANAGER)
      return { OR: [{ reporterId: actor.accountId }, { routeOwnerId: actor.accountId }] };
    if (actor.role === Role.SECTION_HEAD)
      return { OR: [{ reporterId: actor.accountId }, { currentHandlerId: actor.accountId }] };
    return { reporterId: actor.accountId };
  }
  private async authorizedVoice(
    actor: AuthActor,
    id: string,
    include?: Prisma.VoiceInclude,
  ): Promise<any> {
    const voice = await this.prisma.voice.findFirst({
      where: { id, AND: [await this.scope(actor)] },
      include,
    });
    if (!voice) throw forbiddenAsNotFound();
    return voice;
  }
  private serialize(actor: AuthActor, voice: any) {
    const base = {
      id: voice.id,
      displayId: voice.displayId,
      visibility: voice.visibility,
      area: voice.area,
      locationDetail: voice.locationDetail,
      title: voice.title,
      detail: voice.detail,
      category: voice.category,
      severity: voice.severity,
      status: voice.status,
      version: voice.version,
      pic: {
        ...(voice.currentHandlerId ? { id: voice.currentHandlerId } : {}),
        label:
          voice.visibility === 'PRIVATE'
            ? 'Union'
            : voice.currentHandlerId
              ? 'Current handler'
              : 'Route Manager',
      },
    };
    if (actor.accountId === voice.reporterId)
      return { ...base, audience: 'MEMBER', reporter: { self: true } };
    if (voice.visibility === 'PRIVATE')
      return {
        ...base,
        audience: actor.role === Role.CARE_ADMIN ? 'ADMIN_PRIVATE' : 'PRIVATE_RESPONDER',
        anonymousReporter: { alias: voice.anonymousAlias },
      };
    return {
      ...base,
      audience: 'GENERAL_RESPONDER',
      reporter: {
        noReg: voice.reporter.employee.noReg,
        name: voice.reporter.employee.name,
        division: voice.reporter.employee.division,
        department: voice.reporter.employee.department,
      },
    };
  }
  private requireResponder(actor: AuthActor, voice: any) {
    if (
      actor.role === Role.UNION &&
      voice.visibility === VoiceVisibility.PRIVATE &&
      voice.routeOwnerId === actor.accountId
    )
      return;
    if (voice.visibility !== VoiceVisibility.GENERAL) throw forbiddenAsNotFound();
    if (actor.role === Role.MANAGER && voice.routeOwnerId === actor.accountId) return;
    if (actor.role === Role.SECTION_HEAD && voice.currentHandlerId === actor.accountId) return;
    throw forbiddenAsNotFound();
  }
  private async mutateVoice<T>(
    actor: AuthActor,
    id: string,
    expectedVersion: number,
    key: string,
    input: unknown,
    mutation: (tx: Prisma.TransactionClient, voice: any) => Promise<T>,
  ) {
    return this.idempotent(actor, `voice:${id}`, key, input, () =>
      this.prisma.$transaction(
        async (tx) => {
          const voices = await tx.$queryRaw<
            any[]
          >`SELECT * FROM "Voice" WHERE id = ${id}::uuid FOR UPDATE`;
          const voice = voices[0];
          if (!voice || !(await this.canAccess(actor, voice))) throw forbiddenAsNotFound();
          if (voice.version !== expectedVersion)
            throw conflict('VERSION_CONFLICT', 'Voice version is stale', {
              currentVersion: voice.version,
              status: voice.status,
            });
          return mutation(tx, voice);
        },
        { isolationLevel: 'Serializable' },
      ),
    );
  }
  private async canAccess(actor: AuthActor, voice: any) {
    if (actor.role === Role.CARE_ADMIN) return true;
    if (actor.role === Role.UNION)
      return voice.visibility === VoiceVisibility.PRIVATE && voice.routeOwnerId === actor.accountId;
    return (
      voice.reporterId === actor.accountId ||
      voice.routeOwnerId === actor.accountId ||
      voice.currentHandlerId === actor.accountId
    );
  }
  private async idempotent<T>(
    actor: AuthActor,
    scope: string,
    key: string,
    input: unknown,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
    const requestHash = canonicalHash(input);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { accountId_scope_key: { accountId: actor.accountId, scope, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another payload');
      return existing.response as T;
    }
    const result = await action();
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          accountId: actor.accountId,
          scope,
          key,
          requestHash,
          statusCode: 200,
          response: result as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.idempotencyRecord.findUniqueOrThrow({
          where: { accountId_scope_key: { accountId: actor.accountId, scope, key } },
        });
        if (replay.requestHash !== requestHash)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another payload');
        return replay.response as T;
      }
      throw error;
    }
    return result;
  }
  private async notify(
    tx: Prisma.TransactionClient,
    recipientId: string,
    voiceId: string,
    type: NotificationType,
    title: string,
    body: string,
  ) {
    const notification = await tx.notification.create({
      data: { recipientId, voiceId, type, title, body, deepLink: `/voices/${voiceId}` },
    });
    await tx.outboxEvent.create({
      data: {
        topic: 'PUSH_NOTIFICATION',
        dedupeKey: `notification:${notification.id}`,
        payload: { notificationId: notification.id },
      },
    });
    return notification;
  }
}
