import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AccountStatus,
  AttachmentPurpose,
  ClassificationSource,
  HandlerType,
  LocationCompleteness,
  NotificationType,
  Prisma,
  RouteKind,
  RoutingCategory,
  Severity,
  UnionSlot,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { CLASSIFICATION_PROMPT_VERSION, LOCATION_PROMPT_VERSION } from '../ai/prompt';
import type { AuthActor } from '../auth/auth.types';
import { PolicyService } from '../auth/policy.service';
import { canonicalHash } from '../common/crypto';
import { decodeCursor, encodeCursor } from '../common/cursor';
import {
  AppError,
  badRequest,
  conflict,
  forbiddenAsNotFound,
  invalidTransition,
} from '../common/errors';
import { loadConfig } from '../config';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma.service';
import { ratingError, transitionTarget } from './policies';

const attachmentResponseSelect = Prisma.validator<Prisma.AttachmentSelect>()({
  id: true,
  purpose: true,
  state: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  createdAt: true,
  readyAt: true,
});

const draftSchema = z
  .object({
    area: z.enum(['KARAWANG_1', 'KARAWANG_2', 'KARAWANG_3', 'SUNTER_1', 'SUNTER_2']),
    locationDetail: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(150),
    detail: z.string().trim().min(1).max(5000),
    visibility: z.nativeEnum(VoiceVisibility),
    showReporterIdentity: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.visibility === VoiceVisibility.PRIVATE && value.showReporterIdentity === undefined)
      context.addIssue({
        code: 'custom',
        path: ['showReporterIdentity'],
        message: 'Required for Private Voice',
      });
    if (value.visibility === VoiceVisibility.GENERAL && value.showReporterIdentity !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['showReporterIdentity'],
        message: 'Not accepted for General Voice',
      });
  });
const manualSchema = z
  .object({
    category: z.nativeEnum(RoutingCategory).nullable().optional(),
    severity: z.nativeEnum(Severity),
  })
  .strict();
const submitSchema = z
  .object({
    version: z.number().int().positive(),
    locationReviewId: z.string().uuid().nullable().optional(),
    locationContentHash: z.string().length(64).nullable().optional(),
    acknowledgeIncompleteLocation: z.boolean().optional(),
  })
  .strict();
const assignmentSchema = z
  .object({ handlerAccountId: z.string().uuid(), reason: z.string().trim().max(500).optional() })
  .strict();
const textSchema = z
  .object({ text: z.string().trim().min(1).max(4000), version: z.number().int().positive() })
  .strict();
const closeSchema = z
  .object({ note: z.string().trim().min(1).max(4000), version: z.number().int().positive() })
  .strict();
const ratingSchema = z
  .object({
    score: z.number().int(),
    feedback: z.string().trim().max(2000).optional(),
    reopen: z.boolean().default(false),
  })
  .strict();
const locationWarning =
  'Detail lokasi Anda belum lengkap, dan Voice berpotensi tidak ditangani dengan baik.';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw badRequest(
      'VALIDATION_ERROR',
      'Request validation failed',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    );
  return result.data;
};

@Injectable()
export class VoicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}

  async createDraft(actor: AuthActor, input: unknown) {
    if (!actor.capabilities.includes('MEMBER')) throw forbiddenAsNotFound();
    const data = parse(draftSchema, input);
    const organization = await this.currentOrganization(actor);
    const hashes = this.hashes(data);
    return this.prisma.voiceDraft.create({
      data: {
        reporterId: actor.accountId,
        ...data,
        organizationSnapshotId: organization.snapshotId,
        organizationUnitId: organization.organizationUnitId,
        ...hashes,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
  }
  async getDraft(actor: AuthActor, id: string) {
    return this.ownedDraft(actor, id);
  }
  async updateDraft(actor: AuthActor, id: string, input: unknown) {
    const data = parse(draftSchema, input);
    const draft = await this.ownedDraft(actor, id);
    if (draft.submittedAt) throw conflict('DRAFT_SUBMITTED', 'Draft was already submitted');
    const hashes = this.hashes(data);
    const classificationChanged =
      hashes.classificationContentHash !== draft.classificationContentHash;
    const locationChanged = hashes.locationContentHash !== draft.locationContentHash;
    return this.prisma.$transaction(async (tx) => {
      if (classificationChanged) await tx.aIClassification.deleteMany({ where: { draftId: id } });
      if (locationChanged) await tx.locationReviewSnapshot.deleteMany({ where: { draftId: id } });
      return tx.voiceDraft.update({
        where: { id },
        data: { ...data, ...hashes, version: { increment: 1 } },
        include: { classification: true, locationReview: true },
      });
    });
  }
  async deleteDraft(actor: AuthActor, id: string) {
    await this.ownedDraft(actor, id);
    await this.prisma.voiceDraft.delete({ where: { id } });
    return { success: true };
  }
  async addDraftAttachment(actor: AuthActor, id: string, file: Express.Multer.File) {
    await this.ownedDraft(actor, id);
    return this.media.process(file, actor.accountId, AttachmentPurpose.VOICE, { draftId: id });
  }
  async removeDraftAttachment(actor: AuthActor, id: string, attachmentId: string) {
    await this.ownedDraft(actor, id);
    const result = await this.prisma.attachment.deleteMany({
      where: { id: attachmentId, draftId: id, uploaderId: actor.accountId },
    });
    if (!result.count) throw forbiddenAsNotFound();
    return { success: true };
  }

  async classify(actor: AuthActor, id: string) {
    const draft = await this.refreshAiHashes(await this.ownedDraft(actor, id));
    const result = await this.ai.classify({
      visibility: draft.visibility,
      area: draft.visibility === VoiceVisibility.GENERAL ? draft.area : undefined,
      title: draft.title,
      detail: draft.detail,
    });
    if (result.source === 'AI') {
      return this.prisma.aIClassification.upsert({
        where: { draftId: id },
        create: {
          draftId: id,
          model: result.model,
          promptVersion: result.promptVersion,
          source: ClassificationSource.AI,
          ...result.result,
          contentHash: draft.classificationContentHash,
          responseId: result.responseId,
          latencyMs: result.latencyMs,
        },
        update: {
          model: result.model,
          promptVersion: result.promptVersion,
          source: ClassificationSource.AI,
          ...result.result,
          contentHash: draft.classificationContentHash,
          responseId: result.responseId,
          latencyMs: result.latencyMs,
          fallbackCode: null,
        },
      });
    }
    return {
      source: ClassificationSource.MANUAL_FALLBACK,
      fallbackCode: result.fallbackCode,
      candidate: 'candidate' in result ? result.candidate : undefined,
    };
  }
  async manualClassification(actor: AuthActor, id: string, input: unknown) {
    const draft = await this.refreshAiHashes(await this.ownedDraft(actor, id));
    const data = parse(manualSchema, input);
    if (draft.visibility === VoiceVisibility.GENERAL && !data.category)
      throw badRequest('CATEGORY_REQUIRED', 'General Voice manual fallback requires category');
    if (draft.visibility === VoiceVisibility.PRIVATE && data.category != null)
      throw badRequest('PRIVATE_CATEGORY_FORBIDDEN', 'Private Voice does not use a category');
    return this.prisma.aIClassification.upsert({
      where: { draftId: id },
      create: {
        draftId: id,
        model: 'manual',
        promptVersion: CLASSIFICATION_PROMPT_VERSION,
        source: ClassificationSource.MANUAL_FALLBACK,
        category: data.category ?? null,
        severity: data.severity,
        confidence: 1,
        rationaleCode: 'MANUAL',
        contentHash: draft.classificationContentHash,
        fallbackCode: 'MANUAL_SELECTED',
      },
      update: {
        model: 'manual',
        source: ClassificationSource.MANUAL_FALLBACK,
        category: data.category ?? null,
        severity: data.severity,
        confidence: 1,
        rationaleCode: 'MANUAL',
        contentHash: draft.classificationContentHash,
        fallbackCode: 'MANUAL_SELECTED',
      },
    });
  }
  async reviewLocation(actor: AuthActor, id: string) {
    const draft = await this.refreshAiHashes(await this.ownedDraft(actor, id));
    if (
      draft.locationReview?.contentHash === draft.locationContentHash &&
      draft.locationReview.promptVersion === LOCATION_PROMPT_VERSION
    )
      return draft.locationReview;
    const result = await this.ai.reviewLocation({
      area: draft.area,
      locationDetail: draft.locationDetail,
    });
    return this.prisma.locationReviewSnapshot.upsert({
      where: { draftId: id },
      create: {
        draftId: id,
        ...result,
        questions: result.questions,
        contentHash: draft.locationContentHash,
      },
      update: { ...result, questions: result.questions, contentHash: draft.locationContentHash },
    });
  }
  async getLocationReview(actor: AuthActor, id: string) {
    const draft = await this.ownedDraft(actor, id);
    return draft.locationReview;
  }
  async previewDraft(actor: AuthActor, id: string) {
    const draft = await this.ownedDraft(actor, id);
    return { ...draft, routeReadiness: await this.routeReadiness(draft) };
  }

  async submit(actor: AuthActor, id: string, input: unknown, key: string) {
    if (!key || key.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
    const body = parse(submitSchema, input);
    const requestHash = canonicalHash(body);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { accountId_scope_key: { accountId: actor.accountId, scope: `submit:${id}`, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw conflict(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was reused with a different request',
        );
      return existing.response;
    }
    const draft = await this.ownedDraft(actor, id);
    if (draft.version !== body.version)
      throw conflict('DRAFT_VERSION_CONFLICT', 'Draft version changed');
    const currentHashes = this.hashes(draft);
    if (
      currentHashes.classificationContentHash !== draft.classificationContentHash ||
      currentHashes.locationContentHash !== draft.locationContentHash
    )
      throw conflict(
        'DRAFT_AI_SNAPSHOT_STALE',
        'AI model or prompt version changed; reload and preview the draft',
      );
    const current = await this.currentOrganization(actor);
    if (
      draft.organizationSnapshotId !== current.snapshotId ||
      draft.organizationUnitId !== current.organizationUnitId
    )
      throw conflict(
        'DRAFT_ORGANIZATION_STALE',
        'Organization data changed; reload and preview the draft',
      );
    if (
      !draft.classification ||
      draft.classification.contentHash !== draft.classificationContentHash
    )
      throw new AppError(
        'CLASSIFICATION_REQUIRED',
        'A current classification or manual fallback is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (
      draft.locationReview?.completeness === LocationCompleteness.INCOMPLETE &&
      (!body.acknowledgeIncompleteLocation ||
        body.locationReviewId !== draft.locationReview.id ||
        body.locationContentHash !== draft.locationContentHash)
    )
      throw new AppError(
        'LOCATION_ACKNOWLEDGMENT_REQUIRED',
        locationWarning,
        HttpStatus.UNPROCESSABLE_ENTITY,
        [],
        {
          locationReviewId: draft.locationReview.id,
          locationContentHash: draft.locationContentHash,
          warning: locationWarning,
        },
      );
    const classification = draft.classification;
    const route = await this.resolveRoute(draft, classification.category);
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: actor.employeeId! },
    });
    const unit = await this.prisma.organizationUnit.findUniqueOrThrow({
      where: { id: current.organizationUnitId },
    });
    const response = await this.prisma.$transaction(async (tx) => {
      const displayId = await this.nextDisplayId(tx);
      const now = new Date();
      const voice = await tx.voice.create({
        data: {
          displayId,
          reporterId: actor.accountId,
          visibility: draft.visibility,
          area: draft.area,
          reporterOrganizationSnapshotId: current.snapshotId,
          reporterOrganizationUnitId: current.organizationUnitId,
          reporterNoRegSnapshot: employee.noReg,
          reporterNameSnapshot: employee.name,
          reporterDirectorateSnapshot: unit.directorate,
          reporterDivisionSnapshot: unit.division,
          reporterDepartmentSnapshot: unit.department,
          reporterSectionSnapshot: current.section,
          reporterPositionSnapshot: current.structuralPosition,
          showReporterIdentity:
            draft.visibility === VoiceVisibility.PRIVATE ? draft.showReporterIdentity : null,
          locationDetail: draft.locationDetail,
          title: draft.title,
          detail: draft.detail,
          category: draft.visibility === VoiceVisibility.PRIVATE ? null : classification.category,
          severity: classification.severity,
          routeOwnerId: route.ownerAccountId,
          routeMappingId: route.id,
          handlerType:
            draft.visibility === VoiceVisibility.PRIVATE
              ? HandlerType.UNION_HEAD
              : HandlerType.MANAGER,
          anonymousAlias: `Reporter-${displayId.slice(-6)}`,
          locationWarningAcknowledgedAt:
            draft.locationReview?.completeness === LocationCompleteness.INCOMPLETE ? now : null,
        },
      });
      await tx.aIClassification.update({
        where: { id: classification.id },
        data: { draftId: null, voiceId: voice.id },
      });
      if (draft.locationReview)
        await tx.locationReviewSnapshot.update({
          where: { id: draft.locationReview.id },
          data: { draftId: null, voiceId: voice.id },
        });
      await tx.attachment.updateMany({
        where: { draftId: id },
        data: { draftId: null, voiceId: voice.id, state: 'REFERENCED' },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: voice.id,
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          type: VoiceEventType.SUBMITTED,
          payload: { visibility: voice.visibility, category: voice.category },
        },
      });
      await tx.voiceDraft.update({ where: { id }, data: { submittedAt: now } });
      const shaped = { id: voice.id, displayId: voice.displayId, status: voice.status };
      await tx.idempotencyRecord.create({
        data: {
          accountId: actor.accountId,
          scope: `submit:${id}`,
          key,
          requestHash,
          statusCode: 201,
          response: shaped,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await this.notify(
        tx,
        route.ownerAccountId,
        voice.id,
        NotificationType.VOICE_SUBMITTED,
        voice.visibility === VoiceVisibility.PRIVATE ? 'Private Voice baru' : 'General Voice baru',
      );
      return shaped;
    });
    return response;
  }

  async list(
    actor: AuthActor,
    query: {
      status?: VoiceStatus;
      visibility?: VoiceVisibility;
      limit?: string;
      cursor?: string;
      search?: string;
      severity?: Severity;
      area?: string;
      category?: RoutingCategory;
      handler?: string;
      from?: string;
      to?: string;
      sort?: string;
    },
  ) {
    const where = await this.policy.browseScope(actor);
    const take = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const and: Prisma.VoiceWhereInput[] = [where];
    if (query.status) and.push({ status: query.status });
    if (query.visibility) and.push({ visibility: query.visibility });
    if (query.severity) and.push({ severity: query.severity as Severity });
    if (query.area) and.push({ area: query.area as never });
    if (query.category) and.push({ category: query.category as RoutingCategory });
    if (query.handler)
      and.push({ OR: [{ routeOwnerId: query.handler }, { currentHandlerId: query.handler }] });
    if (query.search) {
      and.push({
        OR: [
          { displayId: { contains: query.search, mode: 'insensitive' } },
          { title: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.from || query.to) {
      const submittedAt: Prisma.DateTimeFilter = {};
      if (query.from) submittedAt.gte = new Date(query.from);
      if (query.to) submittedAt.lte = new Date(query.to);
      and.push({ submittedAt });
    }
    const combinedWhere: Prisma.VoiceWhereInput = and.length === 1 ? and[0]! : { AND: and };
    const orderBy: Prisma.VoiceOrderByWithRelationInput[] =
      query.sort === 'severity'
        ? [{ severity: 'desc' }, { submittedAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }];
    const items = await this.prisma.voice.findMany({
      where: combinedWhere,
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy,
      select: this.listSelect(),
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    // audit admin private list reads
    if (actor.capabilities.includes('CARE_ADMIN')) {
      const hasPrivate =
        data.some((v) => (v as { visibility: string }).visibility === 'PRIVATE') ||
        query.visibility === 'PRIVATE';
      if (hasPrivate) await this.auditPrivateRead(actor, 'list', 'PRIVATE_LIST_READ');
    }
    return { items: data, nextCursor };
  }
  async workItems(actor: AuthActor) {
    return {
      items: await this.prisma.voice.findMany({
        where: this.policy.workItemScope(actor),
        orderBy: [{ severity: 'desc' }, { submittedAt: 'asc' }],
        select: this.listSelect(),
      }),
    };
  }
  async detail(actor: AuthActor, id: string) {
    const scope = await this.policy.detailScope(actor);
    const voice = await this.prisma.voice.findFirst({
      where: { id, AND: [scope] },
      include: {
        routeOwner: { select: { id: true, displayName: true } },
        currentHandler: { select: { id: true, displayName: true } },
        classification: true,
        locationReview: true,
        attachments: { select: attachmentResponseSelect },
      },
    });
    if (!voice) throw forbiddenAsNotFound();
    if (actor.capabilities.includes('CARE_ADMIN') && voice.visibility === VoiceVisibility.PRIVATE)
      await this.auditPrivateRead(actor, voice.id, 'PRIVATE_DETAIL_READ');
    return this.serialize(actor, voice);
  }
  async timeline(actor: AuthActor, id: string) {
    const voice = await this.authorizedVoice(actor, id);
    if (actor.capabilities.includes('CARE_ADMIN') && voice.visibility === VoiceVisibility.PRIVATE)
      await this.auditPrivateRead(actor, voice.id, 'PRIVATE_TIMELINE_READ');
    return this.prisma.voiceEvent.findMany({
      where: { voiceId: id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { id: true, type: true, occurredAt: true, payload: true },
    });
  }

  async assign(actor: AuthActor, id: string, input: unknown, key: string, reassign = false) {
    if (!key || key.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
    const data = parse(assignmentSchema, input);
    const voice = await this.actionVoice(actor, id);
    if (voice.status === VoiceStatus.IN_PROGRESS || voice.status === VoiceStatus.CLOSED)
      throw invalidTransition('Assignment is only allowed before IN_PROGRESS');
    if (reassign && !voice.currentHandlerId)
      throw invalidTransition('Voice has no active assignment');
    const candidate = await this.prisma.userAccount.findUnique({
      where: { id: data.handlerAccountId },
      include: {
        employee: { include: { memberships: { where: { snapshot: { status: 'ACTIVE' } } } } },
        unionTerms: { where: { effectiveTo: null } },
      },
    });
    if (!candidate || candidate.status !== AccountStatus.ACTIVE) throw forbiddenAsNotFound();
    let handlerType: HandlerType;
    if (voice.visibility === VoiceVisibility.PRIVATE) {
      if (
        !actor.capabilities.includes('UNION_HEAD') ||
        !candidate.unionTerms.some(
          (term) => term.slot === UnionSlot.OFFICER_1 || term.slot === UnionSlot.OFFICER_2,
        )
      )
        throw forbiddenAsNotFound();
      handlerType = HandlerType.UNION_OFFICER;
    } else {
      const membership = candidate.employee?.memberships[0];
      const route = voice.routeMappingId
        ? await this.prisma.routeMapping.findUnique({ where: { id: voice.routeMappingId } })
        : null;
      const owner = await this.currentMembershipForAccount(voice.routeOwnerId);
      const assignmentUnitId =
        route?.kind === RouteKind.GLOBAL_SPECIAL
          ? owner?.organizationUnitId
          : (route?.organizationUnitId ?? voice.reporterOrganizationUnitId);
      if (
        !membership ||
        membership.structuralPosition.trim().toLocaleLowerCase('en-US') !== 'section head' ||
        !assignmentUnitId ||
        membership.organizationUnitId !== assignmentUnitId
      )
        throw forbiddenAsNotFound();
      handlerType = HandlerType.SECTION_HEAD;
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.voiceAssignment.updateMany({
        where: { voiceId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      const assignment = await tx.voiceAssignment.create({
        data: { voiceId: id, handlerId: candidate.id, handlerType, actorId: actor.accountId },
      });
      const updated = await tx.voice.update({
        where: { id },
        data: {
          currentHandlerId: candidate.id,
          handlerType,
          status: VoiceStatus.IN_VERIFICATION,
          version: { increment: 1 },
        },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          type: reassign ? VoiceEventType.REASSIGNED : VoiceEventType.ASSIGNED,
          payload: { assignmentId: assignment.id, handlerType, reason: data.reason ?? null },
        },
      });
      await this.notify(
        tx,
        candidate.id,
        id,
        NotificationType.ASSIGNED,
        voice.visibility === VoiceVisibility.PRIVATE
          ? 'Private Voice ditugaskan'
          : 'Voice ditugaskan',
      );
      return {
        id: updated.id,
        displayId: updated.displayId,
        status: updated.status,
        version: updated.version,
        currentHandlerId: updated.currentHandlerId,
        handlerType: updated.handlerType,
      };
    });
  }
  reassign(actor: AuthActor, id: string, input: unknown, key: string) {
    return this.assign(actor, id, input, key, true);
  }
  async ask(actor: AuthActor, id: string, input: unknown, _key: string) {
    void _key;
    const data = parse(textSchema, input);
    return this.transitionWithMessage(actor, id, data, 'ASK');
  }
  async proceed(actor: AuthActor, id: string, input: unknown, _key: string) {
    void _key;
    const data = parse(z.object({ version: z.number().int().positive() }).strict(), input);
    const voice = await this.actionVoice(actor, id);
    const target = transitionTarget(voice.status, 'PROCEED');
    if (!target || voice.version !== data.version)
      throw invalidTransition('Voice cannot proceed from its current state');
    return this.updateStatus(actor, voice.id, target, VoiceEventType.PROCEEDED, {});
  }

  async messages(actor: AuthActor, id: string) {
    const voice = await this.authorizedVoice(actor, id);
    if (actor.capabilities.includes('CARE_ADMIN') && voice.visibility === VoiceVisibility.PRIVATE)
      await this.auditPrivateRead(actor, voice.id, 'PRIVATE_MESSAGE_READ');
    const messages = await this.prisma.message.findMany({
      where: { conversation: { voiceId: id } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        text: true,
        createdAt: true,
        senderId: true,
        senderAccountKind: true,
        attachments: { select: attachmentResponseSelect },
      },
    });
    const anonymousUnion =
      voice.visibility === VoiceVisibility.PRIVATE &&
      !voice.showReporterIdentity &&
      !actor.capabilities.includes('CARE_ADMIN') &&
      voice.reporterId !== actor.accountId;
    return messages.map((message) => ({
      ...message,
      senderId:
        anonymousUnion && message.senderId === voice.reporterId ? undefined : message.senderId,
      sender:
        anonymousUnion && message.senderId === voice.reporterId
          ? { kind: 'ANONYMOUS_REPORTER', alias: voice.anonymousAlias }
          : { kind: message.senderAccountKind },
    }));
  }
  async conversations(actor: AuthActor) {
    const scope = await this.policy.detailScope(actor);
    return this.prisma.conversation.findMany({
      where: { voice: scope },
      include: {
        voice: { select: this.listSelect() },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, text: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async addMessage(
    actor: AuthActor,
    id: string,
    input: unknown,
    files: Express.Multer.File[],
    _key: string,
  ) {
    void _key;
    const text = z.object({ text: z.string().trim().max(4000).optional() }).parse(input).text;
    if (!text && !files.length)
      throw badRequest('MESSAGE_EMPTY', 'Message or attachment is required');
    const voice = await this.authorizedVoice(actor, id);
    if (voice.reporterId !== actor.accountId) await this.actionVoice(actor, id);
    const conversation = await this.prisma.conversation.upsert({
      where: { voiceId: id },
      create: { voiceId: id },
      update: {},
    });
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.accountId,
        ...this.policy.senderSnapshot(actor),
        text,
      },
    });
    for (const file of files) {
      const attachment = await this.media.process(file, actor.accountId, AttachmentPurpose.CHAT, {
        voiceId: id,
      });
      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: { voiceId: null, messageId: message.id },
      });
    }
    await this.prisma.voiceEvent.create({
      data: {
        voiceId: id,
        actorId: actor.accountId,
        ...this.policy.actorSnapshot(actor),
        type: VoiceEventType.MESSAGE_SENT,
        payload: { messageId: message.id },
      },
    });
    const recipientId =
      actor.accountId === voice.reporterId
        ? (voice.currentHandlerId ?? voice.routeOwnerId)
        : voice.reporterId;
    await this.prisma.$transaction(async (tx) =>
      this.notify(tx, recipientId, id, NotificationType.MESSAGE, 'Pesan Voice baru'),
    );
    return message;
  }
  async stageEvidence(actor: AuthActor, id: string, file: Express.Multer.File) {
    await this.actionVoice(actor, id);
    return this.media.process(file, actor.accountId, AttachmentPurpose.CLOSURE_EVIDENCE, {
      voiceId: id,
    });
  }
  async close(actor: AuthActor, id: string, input: unknown, _key: string) {
    void _key;
    const data = parse(closeSchema, input);
    const voice = await this.actionVoice(actor, id);
    if (
      voice.version !== data.version ||
      transitionTarget(voice.status, 'CLOSE') !== VoiceStatus.CLOSED
    )
      throw invalidTransition('Voice cannot close from its current state');
    return this.prisma.$transaction(async (tx) => {
      const cycles = await tx.closureCycle.count({ where: { voiceId: id } });
      const closure = await tx.closureCycle.create({
        data: { voiceId: id, cycleNumber: cycles + 1, actorId: actor.accountId, note: data.note },
      });
      await tx.voice.update({
        where: { id },
        data: { status: VoiceStatus.CLOSED, version: { increment: 1 } },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          type: VoiceEventType.CLOSED,
          payload: { closureId: closure.id },
        },
      });
      await this.cleanupLegacy(tx, id);
      await this.notify(tx, voice.reporterId, id, NotificationType.CLOSED, 'Voice ditutup');
      return closure;
    });
  }
  async rate(actor: AuthActor, id: string, input: unknown, _key: string) {
    void _key;
    const data = parse(ratingSchema, input);
    const voice = await this.prisma.voice.findFirst({
      where: { id, reporterId: actor.accountId, status: VoiceStatus.CLOSED },
      include: {
        closureCycles: { where: { reopenedAt: null }, orderBy: { cycleNumber: 'desc' }, take: 1 },
      },
    });
    if (!voice?.closureCycles[0]) throw forbiddenAsNotFound();
    const error = ratingError(data.score, data.feedback, data.reopen);
    if (error) throw badRequest(error, 'Rating is invalid');
    return this.prisma.$transaction(async (tx) => {
      const rating = await tx.rating.create({
        data: { closureCycleId: voice.closureCycles[0]!.id, reporterId: actor.accountId, ...data },
      });
      if (data.reopen) {
        await tx.closureCycle.update({
          where: { id: voice.closureCycles[0]!.id },
          data: { reopenedAt: new Date() },
        });
        await tx.voice.update({
          where: { id },
          data: { status: VoiceStatus.IN_VERIFICATION, version: { increment: 1 } },
        });
      }
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          type: data.reopen ? VoiceEventType.REOPENED : VoiceEventType.RATED,
          payload: { score: data.score },
        },
      });
      await this.notify(
        tx,
        voice.currentHandlerId ?? voice.routeOwnerId,
        id,
        data.reopen ? NotificationType.REOPENED : NotificationType.RATED,
        data.reopen ? 'Voice dibuka kembali' : 'Voice diberi rating',
      );
      return rating;
    });
  }

  async dashboardGeneral(actor: AuthActor) {
    return this.dashboard(actor, VoiceVisibility.GENERAL);
  }
  async dashboardPrivate(actor: AuthActor) {
    let where: Prisma.VoiceWhereInput;
    if (actor.capabilities.includes('CARE_ADMIN') || actor.capabilities.includes('UNION_HEAD'))
      where = { visibility: VoiceVisibility.PRIVATE };
    else if (actor.capabilities.includes('UNION_OFFICER'))
      where = { visibility: VoiceVisibility.PRIVATE, currentHandlerId: actor.accountId };
    else where = { visibility: VoiceVisibility.PRIVATE, reporterId: actor.accountId };
    return this.aggregate(where, false);
  }

  private async dashboard(actor: AuthActor, visibility: VoiceVisibility) {
    let where: Prisma.VoiceWhereInput = { visibility };
    const full = actor.capabilities.some((capability) =>
      ['CARE_ADMIN', 'DIRECTOR', 'UNION_HEAD', 'UNION_OFFICER'].includes(capability),
    );
    if (actor.capabilities.includes('MANAGER') && !full)
      where = {
        visibility,
        reporterDirectorateSnapshot: actor.directorate ?? '__none__',
        reporterDivisionSnapshot: actor.division ?? '__none__',
      };
    else if (!full && !actor.capabilities.includes('DIVISION_LEADERSHIP'))
      where = { visibility, reporterId: actor.accountId };
    return this.aggregate(where, full);
  }
  private async aggregate(where: Prisma.VoiceWhereInput, full: boolean) {
    const scope = where as {
      visibility: VoiceVisibility;
      reporterDirectorateSnapshot?: string;
      reporterDivisionSnapshot?: string;
      reporterId?: string;
      currentHandlerId?: string;
    };
    const conditions = [Prisma.sql`"visibility" = ${scope.visibility}::"VoiceVisibility"`];
    if (scope.reporterDirectorateSnapshot)
      conditions.push(
        Prisma.sql`"reporterDirectorateSnapshot" = ${scope.reporterDirectorateSnapshot}`,
      );
    if (scope.reporterDivisionSnapshot)
      conditions.push(Prisma.sql`"reporterDivisionSnapshot" = ${scope.reporterDivisionSnapshot}`);
    if (scope.reporterId) conditions.push(Prisma.sql`"reporterId" = ${scope.reporterId}::uuid`);
    if (scope.currentHandlerId)
      conditions.push(Prisma.sql`"currentHandlerId" = ${scope.currentHandlerId}::uuid`);
    const [total, statuses, severities, categories, divisions, departments, trendRows] =
      await Promise.all([
        this.prisma.voice.count({ where }),
        this.prisma.voice.groupBy({ by: ['status'], where, _count: { _all: true } }),
        this.prisma.voice.groupBy({ by: ['severity'], where, _count: { _all: true } }),
        this.prisma.voice.groupBy({ by: ['category'], where, _count: { _all: true } }),
        this.prisma.voice.groupBy({
          by: ['reporterDirectorateSnapshot', 'reporterDivisionSnapshot'],
          where,
          _count: { _all: true },
        }),
        this.prisma.voice.groupBy({
          by: [
            'reporterDirectorateSnapshot',
            'reporterDivisionSnapshot',
            'reporterDepartmentSnapshot',
          ],
          where,
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<Array<{ label: string; value: bigint }>>(
          Prisma.sql`SELECT to_char(date_trunc('day', "submittedAt"), 'YYYY-MM-DD') AS label, count(*)::bigint AS value FROM "Voice" WHERE ${Prisma.join(conditions, ' AND ')} GROUP BY 1 ORDER BY 1`,
        ),
      ]);
    const buckets = <T extends Record<string, unknown>>(items: T[], key: keyof T) =>
      items.map((item) => ({
        label: String(item[key] ?? 'NONE'),
        value: (item._count as { _all: number })._all,
      }));
    const suppress = (items: { label: string; value: number }[]) =>
      full
        ? items
        : [
            ...items.filter((item) => item.value >= 5),
            {
              label: 'OTHER_SUPPRESSED',
              value: items
                .filter((item) => item.value < 5)
                .reduce((sum, item) => sum + item.value, 0),
            },
          ].filter((item) => item.value > 0);
    return {
      total,
      status: buckets(statuses, 'status'),
      severity: buckets(severities, 'severity'),
      category: buckets(categories, 'category'),
      trend: trendRows.map((item) => ({ label: item.label, value: Number(item.value) })),
      division: suppress(
        divisions.map((item) => ({
          label: `${item.reporterDirectorateSnapshot} / ${item.reporterDivisionSnapshot}`,
          value: item._count._all,
        })),
      ),
      department: suppress(
        departments.map((item) => ({
          label: `${item.reporterDirectorateSnapshot} / ${item.reporterDivisionSnapshot} / ${item.reporterDepartmentSnapshot}`,
          value: item._count._all,
        })),
      ),
    };
  }

  private async ownedDraft(actor: AuthActor, id: string) {
    const draft = await this.prisma.voiceDraft.findFirst({
      where: { id, reporterId: actor.accountId, expiresAt: { gt: new Date() } },
      include: { classification: true, locationReview: true, attachments: true },
    });
    if (!draft) throw forbiddenAsNotFound();
    return draft;
  }
  private hashes(data: {
    visibility: VoiceVisibility;
    area: string;
    locationDetail: string;
    title: string;
    detail: string;
  }) {
    const model = loadConfig().OPENAI_MODEL || 'manual-fallback';
    return {
      classificationContentHash: canonicalHash({
        visibility: data.visibility,
        area: data.visibility === VoiceVisibility.GENERAL ? data.area : undefined,
        title: data.title.trim(),
        detail: data.detail.trim(),
        model,
        promptVersion: CLASSIFICATION_PROMPT_VERSION,
      }),
      locationContentHash: canonicalHash({
        area: data.area.trim(),
        location: data.locationDetail.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
        model,
        promptVersion: LOCATION_PROMPT_VERSION,
      }),
    };
  }
  private async refreshAiHashes<T extends Awaited<ReturnType<VoicesService['ownedDraft']>>>(
    draft: T,
  ): Promise<T> {
    const hashes = this.hashes(draft);
    const classificationChanged =
      hashes.classificationContentHash !== draft.classificationContentHash;
    const locationChanged = hashes.locationContentHash !== draft.locationContentHash;
    if (!classificationChanged && !locationChanged) return draft;
    return this.prisma.$transaction(async (tx) => {
      if (classificationChanged)
        await tx.aIClassification.deleteMany({ where: { draftId: draft.id } });
      if (locationChanged)
        await tx.locationReviewSnapshot.deleteMany({ where: { draftId: draft.id } });
      return tx.voiceDraft.update({
        where: { id: draft.id },
        data: { ...hashes, version: { increment: 1 } },
        include: { classification: true, locationReview: true, attachments: true },
      });
    }) as Promise<T>;
  }
  private async currentOrganization(actor: AuthActor) {
    if (!actor.employeeId) throw forbiddenAsNotFound();
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { employeeId: actor.employeeId, snapshot: { status: 'ACTIVE' } },
    });
    if (!membership)
      throw conflict(
        'ORGANIZATION_MEMBERSHIP_MISSING',
        'Active organization membership is required',
      );
    return membership;
  }
  private currentMembershipForAccount(accountId: string) {
    return this.prisma.organizationMembership.findFirst({
      where: { employee: { account: { id: accountId } }, snapshot: { status: 'ACTIVE' } },
    });
  }
  private async routeReadiness(draft: {
    visibility: VoiceVisibility;
    organizationUnitId: string | null;
    classification?: { category: RoutingCategory | null } | null;
  }) {
    if (draft.visibility === VoiceVisibility.PRIVATE)
      return {
        ready:
          (await this.prisma.unionAccountTerm.count({
            where: {
              slot: UnionSlot.HEAD,
              effectiveTo: null,
              account: { status: AccountStatus.ACTIVE },
            },
          })) === 1,
      };
    if (!draft.organizationUnitId || !draft.classification)
      return { ready: false, reason: 'CLASSIFICATION_REQUIRED' };
    try {
      await this.resolveRoute(draft, draft.classification.category);
      return { ready: true };
    } catch (error) {
      return {
        ready: false,
        reason: error instanceof AppError ? error.code : 'GENERAL_ROUTE_UNAVAILABLE',
      };
    }
  }
  private async resolveRoute(
    draft: { visibility: VoiceVisibility; organizationUnitId: string | null },
    category: RoutingCategory | null,
  ) {
    if (draft.visibility === VoiceVisibility.PRIVATE) {
      const heads = await this.prisma.unionAccountTerm.findMany({
        where: {
          slot: UnionSlot.HEAD,
          effectiveTo: null,
          account: { status: AccountStatus.ACTIVE },
        },
      });
      if (heads.length !== 1)
        throw conflict(
          'UNION_HEAD_UNAVAILABLE',
          'Private Voice requires exactly one active Union Head',
        );
      return { id: null, ownerAccountId: heads[0]!.accountId };
    }
    if (!draft.organizationUnitId)
      throw conflict('GENERAL_ROUTE_UNAVAILABLE', 'No organization route is available');
    const unit = await this.prisma.organizationUnit.findUniqueOrThrow({
      where: { id: draft.organizationUnitId },
    });
    if (unit.department.trim() === '14')
      throw conflict('GENERAL_ROUTE_FORBIDDEN', 'Department 14 cannot submit General Voice');
    const special =
      category === RoutingCategory.SAFETY ||
      category === RoutingCategory.ENVIRONMENT ||
      category === RoutingCategory.FACILITY;
    const route = await this.prisma.routeMapping.findFirst({
      where: special
        ? {
            kind: RouteKind.GLOBAL_SPECIAL,
            effectiveTo: null,
            owner: { status: AccountStatus.ACTIVE },
          }
        : {
            organizationUnitId: draft.organizationUnitId,
            kind: { in: [RouteKind.DEPARTMENT_HEAD, RouteKind.DEFAULT_DEPARTMENT] },
            effectiveTo: null,
            owner: { status: AccountStatus.ACTIVE },
          },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!route)
      throw conflict(
        'GENERAL_ROUTE_UNAVAILABLE',
        'No valid General Voice route is available; draft was preserved',
      );
    return route;
  }
  private async nextDisplayId(tx: Prisma.TransactionClient) {
    const period = new Date().toISOString().slice(0, 7).replace('-', '');
    const sequence = await tx.humanVoiceSequence.upsert({
      where: { period },
      create: { period, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `CARE-${period}-${String(sequence.value).padStart(6, '0')}`;
  }
  private listSelect(): Prisma.VoiceSelect {
    return {
      id: true,
      displayId: true,
      visibility: true,
      area: true,
      title: true,
      category: true,
      severity: true,
      status: true,
      updatedAt: true,
    };
  }
  private async authorizedVoice(actor: AuthActor, id: string) {
    const scope = await this.policy.detailScope(actor);
    const voice = await this.prisma.voice.findFirst({ where: { id, AND: [scope] } });
    if (!voice) throw forbiddenAsNotFound();
    return voice;
  }
  private async actionVoice(actor: AuthActor, id: string) {
    const voice = await this.authorizedVoice(actor, id);
    const allowed =
      (voice.visibility === VoiceVisibility.GENERAL &&
        (voice.routeOwnerId === actor.accountId || voice.currentHandlerId === actor.accountId)) ||
      (voice.visibility === VoiceVisibility.PRIVATE &&
        (actor.capabilities.includes('UNION_HEAD') ||
          voice.currentHandlerId === actor.accountId)) ||
      actor.accountStatus === AccountStatus.LEGACY_HANDLER;
    if (!allowed) throw forbiddenAsNotFound();
    return voice;
  }
  private async transitionWithMessage(
    actor: AuthActor,
    id: string,
    data: { text: string; version: number },
    action: 'ASK',
  ) {
    const voice = await this.actionVoice(actor, id);
    const target = transitionTarget(voice.status, action);
    if (!target || voice.version !== data.version)
      throw invalidTransition('Voice cannot transition from its current state');
    await this.addMessage(actor, id, { text: data.text }, [], '');
    return this.updateStatus(actor, id, target, VoiceEventType.ASKED_REPORTER, {});
  }
  private async updateStatus(
    actor: AuthActor,
    id: string,
    status: VoiceStatus,
    type: VoiceEventType,
    payload: object,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const voice = await tx.voice.update({
        where: { id },
        data: { status, version: { increment: 1 } },
      });
      await tx.voiceEvent.create({
        data: {
          voiceId: id,
          actorId: actor.accountId,
          ...this.policy.actorSnapshot(actor),
          type,
          payload,
        },
      });
      await this.notify(
        tx,
        voice.reporterId,
        id,
        NotificationType.STATUS_CHANGED,
        'Status Voice diperbarui',
      );
      return {
        id: voice.id,
        displayId: voice.displayId,
        status: voice.status,
        version: voice.version,
        currentHandlerId: voice.currentHandlerId,
        handlerType: voice.handlerType,
      };
    });
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
      routeOwner: voice.routeOwner,
      currentHandler: voice.currentHandler,
      attachments: voice.attachments,
      locationReview: voice.locationReview,
    };
    if (voice.reporterId === actor.accountId)
      return { ...base, audience: 'REPORTER_SELF', reporter: { self: true } };
    if (voice.visibility === VoiceVisibility.GENERAL)
      return {
        ...base,
        audience: actor.capabilities.some((capability: string) =>
          ['DIRECTOR', 'DIVISION_LEADERSHIP', 'UNION_HEAD', 'UNION_OFFICER', 'CARE_ADMIN'].includes(
            capability,
          ),
        )
          ? 'LEADERSHIP_GENERAL_READ_ONLY'
          : 'GENERAL_RESPONDER',
        reporter: {
          noReg: voice.reporterNoRegSnapshot,
          name: voice.reporterNameSnapshot,
          directorate: voice.reporterDirectorateSnapshot,
          division: voice.reporterDivisionSnapshot,
          department: voice.reporterDepartmentSnapshot,
          section: voice.reporterSectionSnapshot,
          position: voice.reporterPositionSnapshot,
        },
      };
    if (actor.capabilities.includes('CARE_ADMIN'))
      return {
        ...base,
        audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
        reporter: {
          noReg: voice.reporterNoRegSnapshot,
          name: voice.reporterNameSnapshot,
          directorate: voice.reporterDirectorateSnapshot,
          division: voice.reporterDivisionSnapshot,
          department: voice.reporterDepartmentSnapshot,
          section: voice.reporterSectionSnapshot,
          position: voice.reporterPositionSnapshot,
        },
      };
    if (voice.showReporterIdentity)
      return {
        ...base,
        audience: 'UNION_IDENTIFIED',
        reporter: {
          noReg: voice.reporterNoRegSnapshot,
          name: voice.reporterNameSnapshot,
          division: voice.reporterDivisionSnapshot,
          department: voice.reporterDepartmentSnapshot,
        },
      };
    return {
      ...base,
      audience: 'UNION_ANONYMOUS',
      anonymousReporter: { alias: voice.anonymousAlias },
    };
  }
  private async auditPrivateRead(actor: AuthActor, voiceId: string, action: string) {
    await this.prisma.auditEvent.create({
      data: {
        actorId: actor.accountId,
        ...this.policy.actorSnapshot(actor),
        action,
        result: 'SUCCESS',
        resourceType: 'VOICE',
        resourceId: voiceId,
        summary: { private: true, content: 'redacted' },
        correlationId: `private-read:${voiceId}`,
        releaseSha: loadConfig().RELEASE_SHA,
      },
    });
  }
  private async notify(
    tx: Prisma.TransactionClient,
    recipientId: string,
    voiceId: string,
    type: NotificationType,
    title: string,
  ) {
    const notification = await tx.notification.create({
      data: {
        recipientId,
        voiceId,
        type,
        title,
        body: 'Ada pembaruan Voice di CARE',
        deepLink: `/voices/${voiceId}`,
      },
    });
    await tx.outboxEvent.create({
      data: {
        topic: 'PUSH_NOTIFICATION',
        dedupeKey: `${type}:${voiceId}:${recipientId}:${notification.id}`,
        payload: { notificationId: notification.id },
      },
    });
  }
  private async cleanupLegacy(tx: Prisma.TransactionClient, voiceId: string) {
    await tx.legacyVoiceAccess.updateMany({
      where: { voiceId, effectiveTo: null },
      data: { effectiveTo: new Date() },
    });
    const accounts = await tx.userAccount.findMany({
      where: { status: AccountStatus.LEGACY_HANDLER },
      select: { id: true },
    });
    for (const account of accounts)
      if (
        !(await tx.legacyVoiceAccess.count({ where: { accountId: account.id, effectiveTo: null } }))
      )
        await tx.userAccount.update({
          where: { id: account.id },
          data: { status: AccountStatus.INACTIVE },
        });
  }
}
