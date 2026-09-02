import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  AccountStatus,
  AttachmentPurpose,
  AttachmentState,
  ClassificationSource,
  ClosureReviewState,
  GeneralVoiceCategoryRouteMode,
  HandlerType,
  LocationCompleteness,
  NotificationType,
  Prisma,
  RouteKind,
  Severity,
  UnionSlot,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
  type AIClassification,
} from '@prisma/client';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { AiRuntimeConfigService, environmentAiConfig } from '../ai/runtime-config.service';
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
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../prisma.service';
import { computeAvailableActions, type ActionActor } from './actions';
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

const draftListItemSelect = Prisma.validator<Prisma.VoiceDraftSelect>()({
  id: true,
  visibility: true,
  area: true,
  locationDetail: true,
  title: true,
  detail: true,
  showReporterIdentity: true,
  version: true,
  expiresAt: true,
  updatedAt: true,
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
const draftPatchSchema = z
  .object({
    area: z.enum(['KARAWANG_1', 'KARAWANG_2', 'KARAWANG_3', 'SUNTER_1', 'SUNTER_2']).optional(),
    locationDetail: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(150).optional(),
    detail: z.string().trim().min(1).max(5000).optional(),
    visibility: z.nativeEnum(VoiceVisibility).optional(),
    showReporterIdentity: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const effectiveVisibility = value.visibility;
    if (effectiveVisibility === VoiceVisibility.PRIVATE && value.showReporterIdentity === undefined)
      context.addIssue({
        code: 'custom',
        path: ['showReporterIdentity'],
        message: 'Required when switching to Private Voice',
      });
    if (effectiveVisibility === VoiceVisibility.GENERAL && value.showReporterIdentity !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['showReporterIdentity'],
        message: 'Not accepted for General Voice',
      });
  });
const manualSchema = z
  .object({
    category: z.string().trim().max(80).nullable().optional(),
    categoryKey: z.string().trim().max(80).nullable().optional(),
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
  .object({
    handlerAccountId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const handoverSchema = z
  .object({
    targetCategoryId: z.string().uuid(),
    detail: z.string().trim().min(1).max(4000),
    expectedVersion: z.number().int().positive(),
  })
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
const routeTargetLabels: Record<RouteKind, string> = {
  DEPARTMENT_HEAD: 'Department Head',
  DEFAULT_DEPARTMENT: 'Default PIC',
  GLOBAL_SPECIAL: 'PIC Global',
  LEGACY: 'Legacy PIC',
};
const remediationCodes: Record<string, string> = {
  GENERAL_ROUTE_FORBIDDEN: 'GENERAL_ROUTE_FORBIDDEN',
  GENERAL_ROUTE_UNAVAILABLE: 'GENERAL_ROUTE_UNAVAILABLE',
  UNION_HEAD_UNAVAILABLE: 'UNION_HEAD_UNAVAILABLE',
  CLASSIFICATION_REQUIRED: 'MANUAL_CLASSIFICATION_REQUIRED',
};

type DashboardFilter = {
  area?: string;
  category?: string;
  severity?: Severity;
  status?: VoiceStatus;
  from?: string;
  to?: string;
};

const DASHBOARD_SUPPRESSION_THRESHOLD = 5;
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
    @Optional()
    @Inject(AiRuntimeConfigService)
    private readonly aiRuntimeConfig?: AiRuntimeConfigService,
    @Optional()
    @Inject(CategoriesService)
    private readonly categories?: CategoriesService,
  ) {}

  private get categoryCatalog() {
    return this.categories ?? new CategoriesService(this.prisma);
  }

  async createDraft(actor: AuthActor, input: unknown) {
    if (!actor.capabilities.includes('MEMBER')) throw forbiddenAsNotFound();
    const data = parse(draftSchema, input);
    const organization = await this.currentOrganization(actor);
    const hashes = await this.hashes(data);
    return this.prisma.voiceDraft.create({
      data: {
        reporterId: actor.accountId,
        ...data,
        organizationSnapshotId: organization.snapshotId,
        organizationUnitId: organization.organizationUnitId,
        ...hashes,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  }
  async getDraft(actor: AuthActor, id: string) {
    return this.publicDraft(await this.ownedDraft(actor, id));
  }
  async listDrafts(actor: AuthActor, query: { limit?: string; cursor?: string }) {
    if (!actor.capabilities.includes('MEMBER')) throw forbiddenAsNotFound();
    const take = Math.min(Math.max(Number(query.limit ?? 20), 1), 50);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.voiceDraft.findMany({
      where: { reporterId: actor.accountId, submittedAt: null, expiresAt: { gt: new Date() } },
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: draftListItemSelect,
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    return { items: data, nextCursor };
  }
  async updateDraft(actor: AuthActor, id: string, input: unknown) {
    const { expectedVersion, ...patch } = parse(draftPatchSchema, input);
    const draft = await this.ownedDraft(actor, id);
    if (draft.submittedAt) throw conflict('DRAFT_SUBMITTED', 'Draft was already submitted');
    if (expectedVersion !== undefined && expectedVersion !== draft.version)
      throw conflict('DRAFT_VERSION_CONFLICT', 'Draft version changed');
    const { visibility, area, locationDetail, title, detail } = { ...draft, ...patch };
    const merged = { visibility, area, locationDetail, title, detail };
    const hashes = await this.hashes(merged);
    const classificationChanged =
      hashes.classificationContentHash !== draft.classificationContentHash;
    const locationChanged = hashes.locationContentHash !== draft.locationContentHash;
    const data = { ...patch, ...hashes };
    const updated = await this.prisma.$transaction(async (tx) => {
      if (classificationChanged) await tx.aIClassification.deleteMany({ where: { draftId: id } });
      if (locationChanged) await tx.locationReviewSnapshot.deleteMany({ where: { draftId: id } });
      return tx.voiceDraft.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
        include: { classification: true, locationReview: true },
      });
    });
    return this.publicDraft(updated);
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
    const categories =
      draft.visibility === VoiceVisibility.GENERAL
        ? await this.categoryCatalog.activeCatalog()
        : [];
    const result = await this.ai.classify({
      visibility: draft.visibility,
      area: draft.visibility === VoiceVisibility.GENERAL ? draft.area : undefined,
      title: draft.title,
      detail: draft.detail,
      categories,
    });
    if (result.source === 'AI') {
      const selected = result.result.category
        ? categories.find((category) => category.key === result.result.category)
        : null;
      const record = await this.prisma.aIClassification.upsert({
        where: { draftId: id },
        create: {
          draftId: id,
          model: result.model,
          promptVersion: result.promptVersion,
          source: ClassificationSource.AI,
          categoryKey: result.result.category,
          severity: result.result.severity,
          confidence: result.result.confidence,
          rationaleCode: result.result.rationaleCode,
          categoryId: selected?.id ?? null,
          categoryRevisionId: selected?.revisionId ?? null,
          contentHash: draft.classificationContentHash,
          responseId: result.responseId,
          latencyMs: result.latencyMs,
        },
        update: {
          model: result.model,
          promptVersion: result.promptVersion,
          source: ClassificationSource.AI,
          categoryKey: result.result.category,
          severity: result.result.severity,
          confidence: result.result.confidence,
          rationaleCode: result.result.rationaleCode,
          categoryId: selected?.id ?? null,
          categoryRevisionId: selected?.revisionId ?? null,
          contentHash: draft.classificationContentHash,
          responseId: result.responseId,
          latencyMs: result.latencyMs,
          fallbackCode: null,
        },
      });
      return this.publicClassification(record);
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
    const categoryKey = data.categoryKey ?? data.category ?? null;
    if (draft.visibility === VoiceVisibility.GENERAL && !categoryKey)
      throw badRequest('CATEGORY_REQUIRED', 'General Voice manual fallback requires category');
    if (draft.visibility === VoiceVisibility.PRIVATE && categoryKey != null)
      throw badRequest('PRIVATE_CATEGORY_FORBIDDEN', 'Private Voice does not use a category');
    const selected = categoryKey ? await this.categoryCatalog.byKey(categoryKey) : null;
    const record = await this.prisma.aIClassification.upsert({
      where: { draftId: id },
      create: {
        draftId: id,
        model: 'manual',
        promptVersion: CLASSIFICATION_PROMPT_VERSION,
        source: ClassificationSource.MANUAL_FALLBACK,
        categoryKey,
        categoryId: selected?.id ?? null,
        categoryRevisionId: selected?.revision.id ?? null,
        severity: data.severity,
        confidence: 1,
        rationaleCode: 'MANUAL',
        contentHash: draft.classificationContentHash,
        fallbackCode: 'MANUAL_SELECTED',
      },
      update: {
        model: 'manual',
        source: ClassificationSource.MANUAL_FALLBACK,
        categoryKey,
        categoryId: selected?.id ?? null,
        categoryRevisionId: selected?.revision.id ?? null,
        severity: data.severity,
        confidence: 1,
        rationaleCode: 'MANUAL',
        contentHash: draft.classificationContentHash,
        fallbackCode: 'MANUAL_SELECTED',
      },
    });
    return this.publicClassification(record);
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
    return {
      ...this.publicDraft(draft),
      routeReadiness: await this.routeReadiness(draft),
      routeTarget: await this.routeTargetLabel(draft),
    };
  }

  private publicClassification(record: AIClassification | null | undefined) {
    if (!record) return record;
    const { categoryKey, categoryLegacy, ...rest } = record;
    void categoryLegacy;
    return { ...rest, category: categoryKey };
  }

  private publicDraft<T extends { classification?: AIClassification | null }>(draft: T) {
    return { ...draft, classification: this.publicClassification(draft.classification) };
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
    const currentHashes = await this.hashes(draft);
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
    const route = await this.resolveRoute(draft, classification.categoryKey);
    const categoryConfig = classification.categoryKey
      ? await this.categoryCatalog.byKey(classification.categoryKey)
      : null;
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
          categoryKey:
            draft.visibility === VoiceVisibility.PRIVATE ? null : classification.categoryKey,
          categoryId: draft.visibility === VoiceVisibility.PRIVATE ? null : categoryConfig?.id,
          categoryNameSnapshot:
            draft.visibility === VoiceVisibility.PRIVATE ? null : categoryConfig?.revision.name,
          currentCategoryKey:
            draft.visibility === VoiceVisibility.PRIVATE ? null : classification.categoryKey,
          currentCategoryId:
            draft.visibility === VoiceVisibility.PRIVATE ? null : categoryConfig?.id,
          currentCategoryNameSnapshot:
            draft.visibility === VoiceVisibility.PRIVATE ? null : categoryConfig?.revision.name,
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
          payload: { visibility: voice.visibility, category: voice.categoryKey },
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
      statusGroup?: 'ACTIVE' | 'CLOSED' | 'ALL';
      visibility?: VoiceVisibility;
      limit?: string;
      cursor?: string;
      search?: string;
      severity?: Severity;
      area?: string;
      category?: string;
      handler?: string;
      from?: string;
      to?: string;
      sort?: string;
    },
  ) {
    this.assertStatusFilter(query.status, query.statusGroup);
    const where = await this.policy.browseScope(actor);
    const take = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const and: Prisma.VoiceWhereInput[] = [where];
    if (query.status) and.push({ status: query.status });
    else if (query.statusGroup === 'ACTIVE')
      and.push({
        status: { in: [VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
      });
    else if (query.statusGroup === 'CLOSED') and.push({ status: VoiceStatus.CLOSED });
    if (query.visibility) and.push({ visibility: query.visibility });
    if (query.severity) and.push({ severity: query.severity as Severity });
    if (query.area) and.push({ area: query.area as never });
    if (query.category)
      and.push({
        OR: [
          { currentCategoryKey: query.category },
          { currentCategoryKey: null, categoryKey: query.category },
        ],
      });
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
      select: this.listSelect(true),
    });
    const hasNext = items.length > take;
    const rows = hasNext ? items.slice(0, take) : items;
    const data = rows.map((row) => this.toListItem(row));
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
  async workItems(
    actor: AuthActor,
    query: {
      status?: VoiceStatus;
      statusGroup?: 'ACTIVE' | 'CLOSED' | 'ALL';
      limit?: string;
      cursor?: string;
      search?: string;
      severity?: Severity;
      area?: string;
      category?: string;
      from?: string;
      to?: string;
      unassigned?: string;
      handler?: string;
    } = {},
  ) {
    this.assertStatusFilter(query.status, query.statusGroup);
    const where = this.policy.workItemScope(actor);
    const take = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const and: Prisma.VoiceWhereInput[] = [where];
    // The Union Head assignment queue: only voices still awaiting an officer.
    // The flag is deliberately ignored for every other actor so existing inbox
    // semantics (Manager route inbox, Section Head assigned inbox) never change.
    if (query.unassigned === 'true' && actor.capabilities.includes('UNION_HEAD'))
      and.push({ currentHandlerId: null });
    if (query.status) and.push({ status: query.status });
    else if (query.statusGroup === 'ACTIVE')
      and.push({
        status: { in: [VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
      });
    else if (query.statusGroup === 'CLOSED') and.push({ status: VoiceStatus.CLOSED });
    if (query.severity) and.push({ severity: query.severity as Severity });
    if (query.area) and.push({ area: query.area as never });
    if (query.category)
      and.push({
        OR: [
          { currentCategoryKey: query.category },
          { currentCategoryKey: null, categoryKey: query.category },
        ],
      });
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
    // Alias chips for Union private inbox cards follow the same consent surface
    // as the detail: the per-Voice alias is only meaningful for Union actors.
    const includeAlias = actor.capabilities.some((capability) =>
      ['UNION_HEAD', 'UNION_OFFICER'].includes(capability),
    );
    const items = await this.prisma.voice.findMany({
      where: combinedWhere,
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ severity: 'desc' }, { submittedAt: 'desc' }, { id: 'desc' }],
      select: { ...this.listSelect(true), anonymousAlias: true },
    });
    const hasNext = items.length > take;
    const rows = hasNext ? items.slice(0, take) : items;
    const data = rows.map((row) => {
      const { anonymousAlias, ...item } = row;
      return {
        ...this.toListItem(item),
        ...(includeAlias && row.visibility === VoiceVisibility.PRIVATE
          ? { reporterAlias: anonymousAlias ?? null }
          : {}),
      };
    });
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    return { items: data, nextCursor };
  }
  async monitoringOptions(actor: AuthActor) {
    const monitors = actor.capabilities.some((capability) =>
      ['MANAGER', 'SECTION_HEAD', 'DIVISION_LEADERSHIP', 'DIRECTOR'].includes(capability),
    );
    if (!monitors) return { handlers: [], generatedAt: new Date().toISOString() };
    const leadership = actor.capabilities.some((capability) =>
      ['DIVISION_LEADERSHIP', 'DIRECTOR'].includes(capability),
    );
    const scope = leadership
      ? { AND: [await this.policy.browseScope(actor), { visibility: VoiceVisibility.GENERAL }] }
      : this.policy.workItemScope(actor);
    const [owners, handlers] = await Promise.all([
      this.prisma.voice.groupBy({ by: ['routeOwnerId'], where: scope }),
      this.prisma.voice.groupBy({ by: ['currentHandlerId'], where: scope }),
    ]);
    const ids = [
      ...new Set([
        ...owners.map((row) => row.routeOwnerId),
        ...handlers.map((row) => row.currentHandlerId).filter((id): id is string => Boolean(id)),
      ]),
    ];
    const accounts = ids.length
      ? await this.prisma.userAccount.findMany({
          where: { id: { in: ids } },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          select: { id: true, displayName: true },
        })
      : [];
    return { handlers: accounts, generatedAt: new Date().toISOString() };
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
        closureCycles: {
          orderBy: { cycleNumber: 'asc' },
          include: {
            evidence: { select: attachmentResponseSelect },
            rating: true,
            actor: { select: { id: true, displayName: true } },
          },
        },
        conversation: { select: { id: true } },
      },
    });
    if (!voice) throw forbiddenAsNotFound();
    if (actor.capabilities.includes('CARE_ADMIN') && voice.visibility === VoiceVisibility.PRIVATE)
      await this.auditPrivateRead(actor, voice.id, 'PRIVATE_DETAIL_READ');
    return this.serialize(actor, voice);
  }
  async timeline(
    actor: AuthActor,
    id: string,
    query: { limit?: string; cursor?: string; order?: 'asc' | 'desc' },
  ) {
    const voice = await this.authorizedVoice(actor, id);
    if (actor.capabilities.includes('CARE_ADMIN') && voice.visibility === VoiceVisibility.PRIVATE)
      await this.auditPrivateRead(actor, voice.id, 'PRIVATE_TIMELINE_READ');
    const take = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const descending = query.order === 'desc';
    const items = await this.prisma.voiceEvent.findMany({
      where: { voiceId: id },
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: descending
        ? [{ occurredAt: 'desc' }, { id: 'desc' }]
        : [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { id: true, type: true, occurredAt: true, payload: true },
    });
    const hasNext = items.length > take;
    const data = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null;
    return { items: data, nextCursor };
  }

  async assign(actor: AuthActor, id: string, input: unknown, key: string, reassign = false) {
    if (!key || key.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
    const data = parse(assignmentSchema, input);
    const voice = await this.actionVoice(actor, id);
    // Only a route-owning Manager (General) or the Union Head (Private) may
    // assign/reassign; a Section Head handler must not be able to assign.
    const authorizedAssigner =
      voice.visibility === VoiceVisibility.GENERAL
        ? actor.capabilities.includes('MANAGER') && voice.routeOwnerId === actor.accountId
        : actor.capabilities.includes('UNION_HEAD');
    if (!authorizedAssigner) throw forbiddenAsNotFound();
    if (data.expectedVersion !== undefined && data.expectedVersion !== voice.version)
      throw conflict('VERSION_CONFLICT', 'Voice version changed');
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
    return this.idempotentMutation(
      actor,
      `${reassign ? 'reassign' : 'assign'}:${id}`,
      key,
      canonicalHash(data),
      200,
      async (tx) => {
        const current = await this.lockedActionVoice(
          tx,
          actor,
          id,
          data.expectedVersion ?? voice.version,
        );
        if (current.status === VoiceStatus.IN_PROGRESS || current.status === VoiceStatus.CLOSED)
          throw invalidTransition('Assignment is only allowed before IN_PROGRESS');
        if (reassign && !current.currentHandlerId)
          throw invalidTransition('Voice has no active assignment');
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
      },
    );
  }
  reassign(actor: AuthActor, id: string, input: unknown, key: string) {
    return this.assign(actor, id, input, key, true);
  }
  async assignmentCandidates(actor: AuthActor, id: string) {
    const voice = await this.actionVoice(actor, id);
    let candidates: Array<{
      id: string;
      displayName: string;
      slot?: UnionSlot;
      structuralPosition?: string;
    }>;
    if (voice.visibility === VoiceVisibility.PRIVATE) {
      const terms = await this.prisma.unionAccountTerm.findMany({
        where: {
          slot: { in: [UnionSlot.OFFICER_1, UnionSlot.OFFICER_2] },
          effectiveTo: null,
          account: { status: AccountStatus.ACTIVE },
        },
        include: { account: { select: { id: true, displayName: true } } },
      });
      candidates = terms
        .filter((term) => term.account.id !== voice.currentHandlerId)
        .map((term) => ({
          id: term.account.id,
          displayName: term.account.displayName,
          slot: term.slot,
        }));
    } else {
      const route = voice.routeMappingId
        ? await this.prisma.routeMapping.findUnique({ where: { id: voice.routeMappingId } })
        : null;
      const owner = await this.currentMembershipForAccount(voice.routeOwnerId);
      const assignmentUnitId =
        route?.kind === RouteKind.GLOBAL_SPECIAL
          ? owner?.organizationUnitId
          : (route?.organizationUnitId ?? voice.reporterOrganizationUnitId);
      if (!assignmentUnitId) return [];
      const memberships = await this.prisma.organizationMembership.findMany({
        where: {
          snapshot: { status: 'ACTIVE' },
          organizationUnitId: assignmentUnitId,
          employee: { account: { status: AccountStatus.ACTIVE } },
        },
        include: {
          employee: { include: { account: { select: { id: true, displayName: true } } } },
        },
      });
      candidates = memberships
        .filter(
          (membership) =>
            membership.structuralPosition?.trim().toLocaleLowerCase('en-US') === 'section head',
        )
        .filter(
          (membership) =>
            membership.employee.account !== null &&
            membership.employee.account.id !== voice.currentHandlerId,
        )
        .map((membership) => ({
          id: membership.employee.account!.id,
          displayName: membership.employee.account!.displayName,
          structuralPosition: membership.structuralPosition,
        }));
    }
    if (!candidates.length) return [];
    // Workload subtitle for the assignment sheet: active voices per candidate.
    const workloads = await this.prisma.voice.groupBy({
      by: ['currentHandlerId'],
      where: {
        currentHandlerId: { in: candidates.map((candidate) => candidate.id) },
        status: { in: [VoiceStatus.OPEN, VoiceStatus.IN_VERIFICATION, VoiceStatus.IN_PROGRESS] },
      },
      _count: { _all: true },
    });
    const activeByHandler = new Map(
      workloads.map((row) => [row.currentHandlerId, row._count._all]),
    );
    return candidates.map((candidate) => ({
      ...candidate,
      activeCount: activeByHandler.get(candidate.id) ?? 0,
    }));
  }

  async handoverOptions(actor: AuthActor, id: string) {
    const voice = await this.handoverSource(actor, id);
    const options = await this.buildHandoverOptions(this.prisma, voice);
    return {
      current: {
        category: {
          id: voice.currentCategoryId ?? voice.categoryId,
          key: voice.currentCategoryKey ?? voice.categoryKey,
          name: voice.currentCategoryNameSnapshot ?? voice.categoryNameSnapshot,
        },
        department: voice.routeMapping?.organizationUnit ?? null,
        pic: voice.routeOwner,
      },
      options,
    };
  }

  async handover(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(handoverSchema, input);
    if (!actor.capabilities.includes('MANAGER')) throw forbiddenAsNotFound();
    return this.idempotentMutation(
      actor,
      `handover:${id}`,
      key,
      canonicalHash(data),
      200,
      async (tx) => {
        await tx.$queryRaw`SELECT "id"::text FROM "Voice" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const voice = await tx.voice.findUnique({
          where: { id },
          include: {
            routeOwner: { select: { id: true, displayName: true } },
            routeMapping: { include: { organizationUnit: true } },
          },
        });
        if (!voice || voice.routeOwnerId !== actor.accountId) throw forbiddenAsNotFound();
        if (
          voice.visibility !== VoiceVisibility.GENERAL ||
          voice.status !== VoiceStatus.OPEN ||
          voice.currentHandlerId !== null
        )
          throw conflict(
            'HANDOVER_INVALID_STATE',
            'Handover hanya tersedia untuk General Voice berstatus Open yang belum ditugaskan',
          );
        if (voice.version !== data.expectedVersion)
          throw conflict('VERSION_CONFLICT', 'Voice version changed');

        const destination = await this.resolveHandoverDestination(
          tx,
          voice.reporterOrganizationUnitId,
          data.targetCategoryId,
        );
        if (destination.pic.id === actor.accountId)
          throw conflict(
            'HANDOVER_DESTINATION_SELF',
            'Kategori tujuan masih ditangani oleh PIC saat ini',
          );

        const sequence =
          ((
            await tx.voiceHandover.aggregate({
              where: { voiceId: id },
              _max: { sequence: true },
            })
          )._max.sequence ?? 0) + 1;
        const sourceUnit = voice.routeMapping?.organizationUnit ?? null;
        const record = await tx.voiceHandover.create({
          data: {
            voiceId: id,
            sequence,
            fromCategoryId: voice.currentCategoryId ?? voice.categoryId,
            fromCategoryKey: voice.currentCategoryKey ?? voice.categoryKey,
            fromCategoryNameSnapshot:
              voice.currentCategoryNameSnapshot ?? voice.categoryNameSnapshot,
            toCategoryId: destination.category.id,
            toCategoryKey: destination.category.key,
            toCategoryNameSnapshot: destination.category.name,
            fromOrganizationUnitId: sourceUnit?.id ?? null,
            fromDirectorateSnapshot: sourceUnit?.directorate ?? null,
            fromDivisionSnapshot: sourceUnit?.division ?? null,
            fromDepartmentSnapshot: sourceUnit?.department ?? null,
            toOrganizationUnitId: destination.department.id,
            toDirectorateSnapshot: destination.department.directorate,
            toDivisionSnapshot: destination.department.division,
            toDepartmentSnapshot: destination.department.department,
            fromRouteMappingId: voice.routeMappingId,
            toRouteMappingId: destination.routeMappingId,
            fromPicId: actor.accountId,
            toPicId: destination.pic.id,
            actorId: actor.accountId,
            routeMode: destination.routeMode,
            isReporterDepartment: destination.isReporterDepartment,
            detail: data.detail,
          },
        });
        const updated = await tx.voice.update({
          where: { id },
          data: {
            currentCategoryId: destination.category.id,
            currentCategoryKey: destination.category.key,
            currentCategoryNameSnapshot: destination.category.name,
            routeOwnerId: destination.pic.id,
            routeMappingId: destination.routeMappingId,
            currentHandlerId: null,
            handlerType: HandlerType.MANAGER,
            version: { increment: 1 },
          },
        });
        await tx.voiceEvent.create({
          data: {
            voiceId: id,
            actorId: actor.accountId,
            ...this.policy.actorSnapshot(actor),
            type: VoiceEventType.HANDOVER_COMPLETED,
            payload: {
              handoverId: record.id,
              sequence,
              fromCategory: record.fromCategoryNameSnapshot,
              toCategory: record.toCategoryNameSnapshot,
              fromDepartment: record.fromDepartmentSnapshot,
              toDepartment: record.toDepartmentSnapshot,
              fromPic: voice.routeOwner.displayName,
              toPic: destination.pic.displayName,
            },
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.accountId,
            ...this.policy.actorSnapshot(actor),
            action: 'VOICE_HANDOVER_COMPLETED',
            result: 'SUCCESS',
            resourceType: 'VOICE',
            resourceId: id,
            summary: {
              handoverId: record.id,
              sequence,
              fromCategoryKey: record.fromCategoryKey,
              toCategoryKey: record.toCategoryKey,
              fromPicId: record.fromPicId,
              toPicId: record.toPicId,
              detail: 'redacted',
            },
            correlationId: `handover:${record.id}`,
            releaseSha: loadConfig().RELEASE_SHA,
          },
        });
        await this.notify(
          tx,
          destination.pic.id,
          id,
          NotificationType.HANDOVER_RECEIVED,
          'Voice diteruskan kepada Anda',
          'Buka CARE untuk melihat detail handover.',
        );
        return {
          id: updated.id,
          displayId: updated.displayId,
          status: updated.status,
          version: updated.version,
          currentHandlerId: updated.currentHandlerId,
          handlerType: updated.handlerType,
          handoverId: record.id,
        };
      },
    );
  }

  async handovers(actor: AuthActor, id: string) {
    const fullScope = await this.policy.detailScope(actor);
    const voice = await this.prisma.voice.findFirst({
      where: { id, AND: [fullScope] },
      select: { id: true, displayId: true },
    });
    const participant = await this.prisma.voiceHandover.count({
      where: { voiceId: id, OR: [{ fromPicId: actor.accountId }, { toPicId: actor.accountId }] },
    });
    if (!voice && !participant) throw forbiddenAsNotFound();
    const minimalVoice =
      voice ??
      (await this.prisma.voice.findUniqueOrThrow({
        where: { id },
        select: { id: true, displayId: true },
      }));
    const participantOnly = !voice;
    const records = await this.prisma.voiceHandover.findMany({
      where: {
        voiceId: id,
        ...(participantOnly
          ? { OR: [{ fromPicId: actor.accountId }, { toPicId: actor.accountId }] }
          : {}),
      },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      include: {
        fromPic: { select: { id: true, displayName: true } },
        toPic: { select: { id: true, displayName: true } },
      },
    });
    return {
      voice: minimalVoice,
      accessMode: participantOnly ? 'PARTICIPANT_ONLY' : 'VOICE_READER',
      items: records.map((record) => this.handoverShape(actor, record)),
    };
  }

  async myHandovers(
    actor: AuthActor,
    query: { cursor?: string; limit?: string; search?: string } = {},
  ) {
    if (!actor.capabilities.includes('MANAGER')) throw forbiddenAsNotFound();
    const take = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const records = await this.prisma.voiceHandover.findMany({
      where: {
        OR: [{ fromPicId: actor.accountId }, { toPicId: actor.accountId }],
        ...(query.search
          ? { voice: { displayId: { contains: query.search, mode: 'insensitive' } } }
          : {}),
      },
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        voice: { select: { id: true, displayId: true } },
        fromPic: { select: { id: true, displayName: true } },
        toPic: { select: { id: true, displayName: true } },
      },
    });
    const hasNext = records.length > take;
    const rows = hasNext ? records.slice(0, take) : records;
    return {
      items: rows.map((record) => ({
        ...this.handoverShape(actor, record),
        voice: record.voice,
        direction: record.fromPicId === actor.accountId ? 'SENT' : 'RECEIVED',
      })),
      nextCursor: hasNext && rows.length ? encodeCursor(rows[rows.length - 1]!.id) : null,
    };
  }
  async ask(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(textSchema, input);
    await this.actionVoice(actor, id);
    return this.idempotentMutation(
      actor,
      `ask:${id}`,
      key,
      canonicalHash(data),
      200,
      async (tx) => {
        const current = await this.lockedActionVoice(tx, actor, id, data.version);
        const target = transitionTarget(current.status, 'ASK');
        if (!target) throw invalidTransition('Voice cannot transition from its current state');
        await this.createMessageWithin(tx, actor, id, data.text, []);
        return this.transitionStatus(tx, actor, id, target, VoiceEventType.ASKED_REPORTER, {});
      },
    );
  }
  async proceed(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(z.object({ version: z.number().int().positive() }).strict(), input);
    await this.actionVoice(actor, id);
    return this.idempotentMutation(
      actor,
      `proceed:${id}`,
      key,
      canonicalHash(data),
      200,
      async (tx) => {
        const current = await this.lockedActionVoice(tx, actor, id, data.version);
        const target = transitionTarget(current.status, 'PROCEED');
        if (!target) throw invalidTransition('Voice cannot proceed from its current state');
        return this.transitionStatus(tx, actor, id, target, VoiceEventType.PROCEEDED, {});
      },
    );
  }

  async messages(
    actor: AuthActor,
    id: string,
    query: { limit?: string; cursor?: string; order?: 'asc' | 'desc' },
  ) {
    const voice = await this.authorizedVoice(actor, id);
    if (this.conversationState(actor, voice) === 'UNAVAILABLE') throw forbiddenAsNotFound();
    if (actor.capabilities.includes('CARE_ADMIN') && voice.visibility === VoiceVisibility.PRIVATE)
      await this.auditPrivateRead(actor, voice.id, 'PRIVATE_MESSAGE_READ');
    const take = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const descending = query.order === 'desc';
    const messages = await this.prisma.message.findMany({
      where: { conversation: { voiceId: id } },
      take: take + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: descending
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        text: true,
        createdAt: true,
        senderId: true,
        senderAccountKind: true,
        attachments: { select: attachmentResponseSelect },
      },
    });
    const hasNext = messages.length > take;
    const data = hasNext ? messages.slice(0, take) : messages;
    const anonymousUnion =
      voice.visibility === VoiceVisibility.PRIVATE &&
      !voice.showReporterIdentity &&
      !actor.capabilities.includes('CARE_ADMIN') &&
      voice.reporterId !== actor.accountId;
    return {
      items: data.map((message) => ({
        ...message,
        senderId:
          anonymousUnion && message.senderId === voice.reporterId ? undefined : message.senderId,
        sender:
          anonymousUnion && message.senderId === voice.reporterId
            ? { kind: 'ANONYMOUS_REPORTER', alias: voice.anonymousAlias }
            : { kind: message.senderAccountKind },
      })),
      nextCursor: hasNext && data.length ? encodeCursor(data[data.length - 1].id) : null,
    };
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
    key: string,
  ) {
    const text = z.object({ text: z.string().trim().max(4000).optional() }).parse(input).text;
    if (!text && !files.length)
      throw badRequest('MESSAGE_EMPTY', 'Message or attachment is required');
    const voice = await this.authorizedVoice(actor, id);
    if (voice.reporterId !== actor.accountId) await this.actionVoice(actor, id);
    if (this.conversationState(actor, voice) !== 'ACTIVE')
      throw invalidTransition('Conversation is not active for this Voice');
    const requestHash = canonicalHash({ text, fileSizes: files.map((file) => file.size) });
    const prior = await this.checkIdempotency<unknown>(actor, `message:${id}`, key, requestHash);
    if (prior.replayed) return prior.response as never;
    const attachmentIds: string[] = [];
    for (const file of files) {
      const attachment = await this.media.process(file, actor.accountId, AttachmentPurpose.CHAT, {
        voiceId: id,
      });
      attachmentIds.push(attachment.id);
    }
    return this.idempotentMutation(actor, `message:${id}`, key, requestHash, 201, (tx) =>
      this.createMessageWithin(tx, actor, id, text ?? '', attachmentIds),
    );
  }
  async stageEvidence(actor: AuthActor, id: string, file: Express.Multer.File) {
    await this.actionVoice(actor, id);
    return this.media.process(file, actor.accountId, AttachmentPurpose.CLOSURE_EVIDENCE, {
      voiceId: id,
    });
  }
  async close(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(closeSchema, input);
    const voice = await this.actionVoice(actor, id);
    return this.idempotentMutation(
      actor,
      `close:${id}`,
      key,
      canonicalHash(data),
      201,
      async (tx) => {
        if (
          voice.version !== data.version ||
          transitionTarget(voice.status, 'CLOSE') !== VoiceStatus.CLOSED
        )
          throw invalidTransition('Voice cannot close from its current state');
        const staged = await tx.attachment.findMany({
          where: {
            voiceId: id,
            purpose: AttachmentPurpose.CLOSURE_EVIDENCE,
            closureId: null,
            state: AttachmentState.READY,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (staged.length > 5)
          throw badRequest('EVIDENCE_LIMIT', 'At most 5 closure evidence files are allowed');
        const cycles = await tx.closureCycle.count({ where: { voiceId: id } });
        const closedAt = new Date();
        const closure = await tx.closureCycle.create({
          data: {
            voiceId: id,
            cycleNumber: cycles + 1,
            actorId: actor.accountId,
            note: data.note,
            closedAt,
            reviewState: ClosureReviewState.PENDING,
            reviewDeadline: new Date(
              closedAt.getTime() + loadConfig().CLOSURE_REVIEW_DAYS * 86_400_000,
            ),
          },
        });
        if (staged.length)
          await tx.attachment.updateMany({
            where: { id: { in: staged.map((item) => item.id) } },
            data: { voiceId: null, closureId: closure.id, state: AttachmentState.REFERENCED },
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
            payload: { closureId: closure.id, evidenceCount: staged.length },
          },
        });
        await this.cleanupLegacy(tx, id);
        await this.notify(
          tx,
          voice.reporterId,
          id,
          NotificationType.CLOSED,
          'Voice ditutup',
          'Voice telah ditutup. Beri penilaian dalam 2 hari; tanpa penilaian, penyelesaian diterima otomatis.',
        );
        return closure;
      },
    );
  }
  async rate(actor: AuthActor, id: string, input: unknown, key: string) {
    const data = parse(ratingSchema, input);
    // Reopen eligibility also depends on the review window resolved inside the
    // transaction below; this pass still rejects structurally invalid ratings
    // and reopen attempts on high scores.
    const error = ratingError(data.score, data.feedback, data.reopen, true);
    if (error) throw badRequest(error, 'Rating is invalid');
    return this.idempotentMutation(
      actor,
      `rate:${id}`,
      key,
      canonicalHash(data),
      201,
      async (tx) => {
        const voice = await tx.voice.findFirst({
          where: { id, reporterId: actor.accountId, status: VoiceStatus.CLOSED },
          include: {
            closureCycles: {
              where: { reopenedAt: null },
              orderBy: { cycleNumber: 'desc' },
              take: 1,
              include: { rating: true },
            },
          },
        });
        const cycle = voice?.closureCycles[0];
        if (!voice || !cycle) throw forbiddenAsNotFound();
        if (cycle.rating) throw invalidTransition('Closure cycle already has a rating');
        // A late rating after auto-acceptance is still recorded as feedback, but
        // it can no longer reopen the voice once the review window has closed.
        const reopenAllowed =
          cycle.reviewDeadline !== null && cycle.reviewDeadline.getTime() >= Date.now();
        if (data.reopen && !reopenAllowed)
          throw badRequest('REOPEN_NOT_ALLOWED', 'The closure review window has closed');
        const rating = await tx.rating.create({
          data: {
            closureCycleId: cycle.id,
            reporterId: actor.accountId,
            ...data,
          },
        });
        let recipientId = voice.currentHandlerId ?? voice.routeOwnerId;
        if (data.reopen) {
          // Reopen resilience: hand the voice back to the last PIC only if that account is
          // still ACTIVE; otherwise fall back to the route owner so a deactivated handler
          // cannot strand a reopened voice.
          let handlerId = voice.currentHandlerId ?? voice.routeOwnerId;
          let handlerType = voice.handlerType;
          if (
            handlerId &&
            (await tx.userAccount.count({
              where: { id: handlerId, status: AccountStatus.ACTIVE },
            })) !== 1
          ) {
            handlerId = voice.routeOwnerId;
            handlerType =
              voice.visibility === VoiceVisibility.PRIVATE
                ? HandlerType.UNION_HEAD
                : HandlerType.MANAGER;
          }
          recipientId = handlerId;
          await tx.closureCycle.update({
            where: { id: cycle.id },
            data: {
              reopenedAt: new Date(),
              reviewState: ClosureReviewState.REJECTED,
              reviewResolvedAt: new Date(),
            },
          });
          await tx.voice.update({
            where: { id },
            data: {
              status: VoiceStatus.IN_VERIFICATION,
              version: { increment: 1 },
              currentHandlerId: handlerId,
              handlerType,
            },
          });
        } else if (cycle.reviewState === ClosureReviewState.PENDING) {
          // A late rating on an already auto-accepted cycle leaves the resolved
          // review untouched; only a pending cycle resolves here.
          await tx.closureCycle.update({
            where: { id: cycle.id },
            data: { reviewState: ClosureReviewState.ACCEPTED, reviewResolvedAt: new Date() },
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
          recipientId,
          id,
          data.reopen ? NotificationType.REOPENED : NotificationType.RATED,
          data.reopen ? 'Voice dibuka kembali' : 'Voice diberi rating',
        );
        return rating;
      },
    );
  }

  async dashboardGeneral(actor: AuthActor, filter: DashboardFilter = {}) {
    const aggregate = await this.dashboard(actor, VoiceVisibility.GENERAL, filter);
    // Operational inbox stat for a scoped Manager: General Voices on their route
    // still awaiting a Section Head assignment. Mirrors the aggregate scope and
    // ignores dashboard filters, matching the Union Head semantics.
    const isScopedManager =
      actor.capabilities.includes('MANAGER') &&
      !actor.capabilities.some((capability) =>
        ['CARE_ADMIN', 'DIRECTOR', 'DIVISION_LEADERSHIP'].includes(capability),
      );
    if (!isScopedManager) return aggregate;
    const pendingAssignment = await this.prisma.voice.count({
      where: {
        visibility: VoiceVisibility.GENERAL,
        reporterDirectorateSnapshot: actor.directorate ?? '__none__',
        reporterDivisionSnapshot: actor.division ?? '__none__',
        status: VoiceStatus.OPEN,
        currentHandlerId: null,
      },
    });
    return { ...aggregate, pendingAssignment };
  }
  async dashboardPrivate(actor: AuthActor, filter: DashboardFilter = {}) {
    let where: Prisma.VoiceWhereInput;
    if (actor.capabilities.includes('CARE_ADMIN') || actor.capabilities.includes('UNION_HEAD'))
      where = { visibility: VoiceVisibility.PRIVATE };
    else if (actor.capabilities.includes('UNION_OFFICER'))
      where = { visibility: VoiceVisibility.PRIVATE, currentHandlerId: actor.accountId };
    else where = { visibility: VoiceVisibility.PRIVATE, reporterId: actor.accountId };
    // Union Head assignment summary: Private Voices still awaiting an officer.
    // Deliberately independent of dashboard filters; the home card links to the
    // unassigned queue on /work-items which applies no status/severity filter.
    const isUnionHead = actor.capabilities.includes('UNION_HEAD');
    const [aggregate, pendingAssignment] = await Promise.all([
      this.aggregate(where, false, filter),
      isUnionHead
        ? this.prisma.voice.count({
            where: { visibility: VoiceVisibility.PRIVATE, currentHandlerId: null },
          })
        : Promise.resolve(undefined),
    ]);
    return { ...aggregate, pendingAssignment };
  }
  async dashboardMember(actor: AuthActor) {
    if (!actor.capabilities.includes('MEMBER')) throw forbiddenAsNotFound();
    const where: Prisma.VoiceWhereInput = { reporterId: actor.accountId };
    const [total, grouped, recent, draft, closedPendingReview] = await Promise.all([
      this.prisma.voice.count({ where }),
      this.prisma.voice.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.voice.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: this.listSelect(),
      }),
      this.prisma.voiceDraft.findFirst({
        where: { reporterId: actor.accountId, submittedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { updatedAt: 'desc' },
        select: draftListItemSelect,
      }),
      // Exactly one pending review cycle can exist per voice (a newer cycle
      // always supersedes the previous one), so this count is the reporter's
      // "awaiting my rating" total.
      this.prisma.closureCycle.count({
        where: {
          reviewState: ClosureReviewState.PENDING,
          reopenedAt: null,
          voice: { reporterId: actor.accountId, status: VoiceStatus.CLOSED },
        },
      }),
    ]);
    const counts: Record<VoiceStatus, number> = {
      OPEN: 0,
      IN_VERIFICATION: 0,
      IN_PROGRESS: 0,
      CLOSED: 0,
    };
    for (const row of grouped) counts[row.status] = row._count._all;
    return {
      total,
      counts,
      closedPendingReview,
      recent: recent.map((row) => this.toListItem(row)),
      draft,
      generatedAt: new Date().toISOString(),
    };
  }

  private async dashboard(
    actor: AuthActor,
    visibility: VoiceVisibility,
    filter: DashboardFilter = {},
  ) {
    let where: Prisma.VoiceWhereInput = { visibility };
    const full = actor.capabilities.some((capability) =>
      ['CARE_ADMIN', 'DIRECTOR', 'UNION_HEAD', 'UNION_OFFICER'].includes(capability),
    );
    // A Section Head's aggregate overview is scoped to voices currently assigned
    // to them, not to voices they happened to report.
    if (actor.capabilities.includes('SECTION_HEAD') && !full)
      where = { visibility, currentHandlerId: actor.accountId };
    else if (actor.capabilities.includes('MANAGER') && !full)
      where = {
        visibility,
        reporterDirectorateSnapshot: actor.directorate ?? '__none__',
        reporterDivisionSnapshot: actor.division ?? '__none__',
      };
    else if (!full && !actor.capabilities.includes('DIVISION_LEADERSHIP'))
      where = { visibility, reporterId: actor.accountId };
    return this.aggregate(where, full, filter);
  }
  private async aggregate(
    where: Prisma.VoiceWhereInput,
    full: boolean,
    filter: DashboardFilter = {},
  ) {
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
    if (filter.area) conditions.push(Prisma.sql`"area" = ${filter.area}::"Area"`);
    if (filter.category)
      conditions.push(
        Prisma.sql`COALESCE("currentCategoryKey", "categoryKey") = ${filter.category}`,
      );
    if (filter.severity) conditions.push(Prisma.sql`"severity" = ${filter.severity}::"Severity"`);
    if (filter.status) conditions.push(Prisma.sql`"status" = ${filter.status}::"VoiceStatus"`);
    if (filter.from) conditions.push(Prisma.sql`"submittedAt" >= ${new Date(filter.from)}`);
    if (filter.to) conditions.push(Prisma.sql`"submittedAt" <= ${new Date(filter.to)}`);

    const and: Prisma.VoiceWhereInput[] = [where];
    if (filter.area) and.push({ area: filter.area as never });
    if (filter.category)
      and.push({
        OR: [
          { currentCategoryKey: filter.category },
          { currentCategoryKey: null, categoryKey: filter.category },
        ],
      });
    if (filter.severity) and.push({ severity: filter.severity as Severity });
    if (filter.status) and.push({ status: filter.status as VoiceStatus });
    if (filter.from || filter.to) {
      const submittedAt: Prisma.DateTimeFilter = {};
      if (filter.from) submittedAt.gte = new Date(filter.from);
      if (filter.to) submittedAt.lte = new Date(filter.to);
      and.push({ submittedAt });
    }
    const combinedWhere: Prisma.VoiceWhereInput = and.length === 1 ? and[0]! : { AND: and };

    const [
      total,
      statuses,
      severities,
      categories,
      areas,
      areaCriticals,
      divisions,
      departments,
      trendRows,
    ] = await Promise.all([
      this.prisma.voice.count({ where: combinedWhere }),
      this.prisma.voice.groupBy({ by: ['status'], where: combinedWhere, _count: { _all: true } }),
      this.prisma.voice.groupBy({
        by: ['severity'],
        where: combinedWhere,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ categoryKey: string | null; value: bigint }>>(
        Prisma.sql`SELECT COALESCE("currentCategoryKey", "categoryKey") AS "categoryKey", count(*)::bigint AS value FROM "Voice" WHERE ${Prisma.join(conditions, ' AND ')} GROUP BY 1`,
      ),
      this.prisma.voice.groupBy({ by: ['area'], where: combinedWhere, _count: { _all: true } }),
      this.prisma.voice.groupBy({
        by: ['area'],
        where: { AND: [...and, { severity: Severity.CRITICAL }] },
        _count: { _all: true },
      }),
      this.prisma.voice.groupBy({
        by: ['reporterDirectorateSnapshot', 'reporterDivisionSnapshot'],
        where: combinedWhere,
        _count: { _all: true },
      }),
      this.prisma.voice.groupBy({
        by: [
          'reporterDirectorateSnapshot',
          'reporterDivisionSnapshot',
          'reporterDepartmentSnapshot',
        ],
        where: combinedWhere,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ label: string; value: bigint }>>(
        Prisma.sql`SELECT to_char(date_trunc('day', "submittedAt"), 'YYYY-MM-DD') AS label, count(*)::bigint AS value FROM "Voice" WHERE ${Prisma.join(conditions, ' AND ')} GROUP BY 1 ORDER BY 1`,
      ),
    ]);
    // Previous-period total for trend delta badges: the same filters with the
    // from/to window shifted back by its own duration. Omitted without a window.
    let previousTotal: number | undefined;
    if (filter.from && filter.to) {
      const fromMs = new Date(filter.from).getTime();
      const durationMs = new Date(filter.to).getTime() - fromMs;
      if (durationMs > 0) {
        const previousAnd: Prisma.VoiceWhereInput[] = and.filter(
          (clause) => !('submittedAt' in clause),
        );
        previousAnd.push({
          submittedAt: { gte: new Date(fromMs - durationMs), lt: new Date(fromMs) },
        });
        previousTotal = await this.prisma.voice.count({
          where: previousAnd.length === 1 ? previousAnd[0]! : { AND: previousAnd },
        });
      }
    }
    const buckets = <T extends Record<string, unknown>>(items: T[], key: keyof T) =>
      items.map((item) => ({
        label: String(item[key] ?? 'NONE'),
        value: (item._count as { _all: number })._all,
      }));
    const suppress = (items: { label: string; value: number }[]) => {
      if (full) return { buckets: items, suppressedBuckets: 0, suppressedValue: 0 };
      const kept = items.filter((item) => item.value >= DASHBOARD_SUPPRESSION_THRESHOLD);
      const removed = items.filter((item) => item.value < DASHBOARD_SUPPRESSION_THRESHOLD);
      const removedValue = removed.reduce((sum, item) => sum + item.value, 0);
      const merged = kept.map((item) => ({ label: item.label, value: item.value }));
      if (removedValue > 0) merged.push({ label: 'OTHER_SUPPRESSED', value: removedValue });
      return {
        buckets: merged.filter((item) => item.value > 0),
        suppressedBuckets: removed.length,
        suppressedValue: removedValue,
      };
    };
    const division = suppress(
      divisions.map((item) => ({
        label: `${item.reporterDirectorateSnapshot} / ${item.reporterDivisionSnapshot}`,
        value: item._count._all,
      })),
    );
    const department = suppress(
      departments.map((item) => ({
        label: `${item.reporterDirectorateSnapshot} / ${item.reporterDivisionSnapshot} / ${item.reporterDepartmentSnapshot}`,
        value: item._count._all,
      })),
    );
    const categoryNames = new Map(
      (
        await this.prisma.generalVoiceCategory.findMany({
          where: {
            key: {
              in: categories.flatMap((item) => (item.categoryKey ? [item.categoryKey] : [])),
            },
          },
          select: {
            key: true,
            revisions: { where: { effectiveTo: null }, take: 1, select: { name: true } },
          },
        })
      ).map((category) => [category.key, category.revisions[0]?.name ?? category.key]),
    );
    const categoryBuckets = categories.map((item) => {
      const key = item.categoryKey ?? 'NONE';
      const name = categoryNames.get(key) ?? key;
      return { key, name, label: name, value: Number(item.value) };
    });
    const area = suppress(
      areas.map((item) => ({ label: String(item.area), value: item._count._all })),
    );
    const areaCritical = suppress(
      areaCriticals.map((item) => ({ label: String(item.area), value: item._count._all })),
    );
    return {
      total,
      status: buckets(statuses, 'status'),
      severity: buckets(severities, 'severity'),
      category: categoryBuckets,
      trend: trendRows.map((item) => ({ label: item.label, value: Number(item.value) })),
      division: division.buckets,
      department: department.buckets,
      area: area.buckets,
      areaCritical: areaCritical.buckets,
      ...(previousTotal !== undefined ? { previousTotal } : {}),
      suppression: {
        enabled: !full,
        threshold: DASHBOARD_SUPPRESSION_THRESHOLD,
        division: {
          suppressedBuckets: division.suppressedBuckets,
          suppressedValue: division.suppressedValue,
        },
        department: {
          suppressedBuckets: department.suppressedBuckets,
          suppressedValue: department.suppressedValue,
        },
      },
      filters: {
        area: filter.area ?? null,
        category: filter.category ?? null,
        severity: filter.severity ?? null,
        status: filter.status ?? null,
        from: filter.from ?? null,
        to: filter.to ?? null,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async checkIdempotency<T>(
    actor: AuthActor,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<{ replayed: boolean; response?: T }> {
    if (!key || key.length > 100)
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required');
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { accountId_scope_key: { accountId: actor.accountId, scope, key } },
    });
    if (!existing) return { replayed: false };
    if (existing.requestHash !== requestHash)
      throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with a different request');
    return { replayed: true, response: existing.response as T };
  }
  private async idempotentMutation<T>(
    actor: AuthActor,
    scope: string,
    key: string,
    requestHash: string,
    statusCode: number,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const prior = await this.checkIdempotency<T>(actor, scope, key, requestHash);
    if (prior.replayed) return prior.response as T;
    return this.prisma.$transaction(async (tx) => {
      const result = await run(tx);
      try {
        await tx.idempotencyRecord.create({
          data: {
            accountId: actor.accountId,
            scope,
            key,
            requestHash,
            statusCode,
            response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const winner = await tx.idempotencyRecord.findUnique({
            where: { accountId_scope_key: { accountId: actor.accountId, scope, key } },
          });
          if (winner && winner.requestHash === requestHash) return winner.response as T;
          throw conflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was reused with a different request',
          );
        }
        throw error;
      }
      return result;
    });
  }
  private async transitionStatus(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    id: string,
    status: VoiceStatus,
    type: VoiceEventType,
    payload: object,
  ) {
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
  }
  private async createMessageWithin(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    id: string,
    text: string,
    attachmentIds: string[],
  ) {
    const conversation = await tx.conversation.upsert({
      where: { voiceId: id },
      create: { voiceId: id },
      update: {},
    });
    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.accountId,
        ...this.policy.senderSnapshot(actor),
        text,
      },
    });
    if (attachmentIds.length)
      await tx.attachment.updateMany({
        where: { id: { in: attachmentIds } },
        data: { voiceId: null, messageId: message.id },
      });
    await tx.voiceEvent.create({
      data: {
        voiceId: id,
        actorId: actor.accountId,
        ...this.policy.actorSnapshot(actor),
        type: VoiceEventType.MESSAGE_SENT,
        payload: { messageId: message.id },
      },
    });
    const voice = await tx.voice.findUnique({
      where: { id },
      select: { reporterId: true, currentHandlerId: true, routeOwnerId: true },
    });
    const recipientId =
      voice && actor.accountId === voice.reporterId
        ? (voice.currentHandlerId ?? voice.routeOwnerId)
        : voice?.reporterId;
    if (recipientId)
      await this.notify(tx, recipientId, id, NotificationType.MESSAGE, 'Pesan Voice baru');
    return message;
  }

  private async ownedDraft(actor: AuthActor, id: string) {
    const draft = await this.prisma.voiceDraft.findFirst({
      where: { id, reporterId: actor.accountId, expiresAt: { gt: new Date() } },
      include: { classification: true, locationReview: true, attachments: true },
    });
    if (!draft) throw forbiddenAsNotFound();
    return draft;
  }
  private async hashes(data: {
    visibility: VoiceVisibility;
    area: string;
    locationDetail: string;
    title: string;
    detail: string;
  }) {
    const effective = this.aiRuntimeConfig
      ? await this.aiRuntimeConfig.effective()
      : environmentAiConfig();
    const model = effective.model || 'manual-fallback';
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
    const hashes = await this.hashes(draft);
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
    classification?: { categoryKey: string | null } | null;
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
        targetLabel: 'Union Head',
      };
    if (!draft.organizationUnitId || !draft.classification)
      return {
        ready: false,
        reason: 'CLASSIFICATION_REQUIRED',
        remediationCode: 'MANUAL_CLASSIFICATION_REQUIRED',
      };
    try {
      const route = await this.resolveRoute(draft, draft.classification.categoryKey);
      return { ready: true, targetLabel: routeTargetLabels[route.kind as RouteKind] };
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'GENERAL_ROUTE_UNAVAILABLE';
      return {
        ready: false,
        reason: code,
        remediationCode: remediationCodes[code as keyof typeof remediationCodes] ?? code,
      };
    }
  }
  private async routeTargetLabel(draft: {
    visibility: VoiceVisibility;
    organizationUnitId: string | null;
    classification?: { categoryKey: string | null } | null;
  }) {
    if (draft.visibility === VoiceVisibility.PRIVATE) return 'Union Head';
    if (!draft.organizationUnitId || !draft.classification) return null;
    try {
      const route = await this.resolveRoute(draft, draft.classification.categoryKey);
      return routeTargetLabels[route.kind as RouteKind];
    } catch {
      return null;
    }
  }
  private async resolveRoute(
    draft: { visibility: VoiceVisibility; organizationUnitId: string | null },
    category: string | null,
  ): Promise<{ id: string | null; ownerAccountId: string; kind?: RouteKind }> {
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
    if (!category)
      throw conflict('GENERAL_ROUTE_UNAVAILABLE', 'General Voice category is required');
    const categoryConfig = await this.categoryCatalog.byKey(category);
    if (!categoryConfig.route)
      throw conflict('GENERAL_ROUTE_UNAVAILABLE', 'Kategori belum memiliki konfigurasi route');
    const targetUnitId =
      categoryConfig.route.mode === 'FIXED_DEPARTMENT'
        ? categoryConfig.route.organizationUnitId
        : draft.organizationUnitId;
    if (!targetUnitId)
      throw conflict('GENERAL_ROUTE_UNAVAILABLE', 'Department tujuan kategori belum dikonfigurasi');
    const route = await this.prisma.routeMapping.findFirst({
      where: {
        organizationUnitId: targetUnitId,
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
  private listSelect(includeHandler = false): Prisma.VoiceSelect {
    return {
      id: true,
      displayId: true,
      visibility: true,
      area: true,
      title: true,
      categoryKey: true,
      categoryNameSnapshot: true,
      currentCategoryKey: true,
      currentCategoryNameSnapshot: true,
      severity: true,
      status: true,
      updatedAt: true,
      // Review state of the latest closure cycle for status chips; at most one
      // cycle can be pending per voice, so the newest row is enough.
      closureCycles: {
        orderBy: { cycleNumber: 'desc' },
        take: 1,
        select: { reviewState: true, reviewDeadline: true },
      },
      // PIC display name for operational inbox cards; only joined for responder/
      // leadership/union lists, never for reporter-facing payloads.
      ...(includeHandler ? { currentHandler: { select: { displayName: true } } } : {}),
    };
  }
  private toListItem<
    T extends {
      categoryKey: string | null;
      currentCategoryKey: string | null;
      categoryNameSnapshot?: string | null;
      currentCategoryNameSnapshot?: string | null;
      currentHandler?: { displayName: string } | null;
      closureCycles?: Array<{
        reviewState: ClosureReviewState;
        reviewDeadline: Date | null;
      }> | null;
    },
  >(row: T) {
    const {
      currentHandler,
      categoryKey,
      currentCategoryKey,
      categoryNameSnapshot,
      currentCategoryNameSnapshot,
      closureCycles,
      ...rest
    } = row;
    return {
      ...rest,
      category: currentCategoryKey ?? categoryKey,
      categoryNameSnapshot: currentCategoryNameSnapshot ?? categoryNameSnapshot ?? null,
      currentHandlerName: currentHandler?.displayName ?? null,
      closureReviewState: closureCycles?.[0]?.reviewState ?? null,
      closureReviewDeadline: closureCycles?.[0]?.reviewDeadline ?? null,
    };
  }
  private async authorizedVoice(actor: AuthActor, id: string) {
    const scope = await this.policy.detailScope(actor);
    const voice = await this.prisma.voice.findFirst({
      where: { id, AND: [scope] },
      include: { conversation: { select: { id: true } } },
    });
    if (!voice) throw forbiddenAsNotFound();
    return voice;
  }
  private async handoverSource(actor: AuthActor, id: string) {
    if (!actor.capabilities.includes('MANAGER')) throw forbiddenAsNotFound();
    const voice = await this.prisma.voice.findFirst({
      where: { id, routeOwnerId: actor.accountId, visibility: VoiceVisibility.GENERAL },
      include: {
        routeOwner: { select: { id: true, displayName: true } },
        routeMapping: { include: { organizationUnit: true } },
      },
    });
    if (!voice) throw forbiddenAsNotFound();
    if (voice.status !== VoiceStatus.OPEN || voice.currentHandlerId !== null)
      throw conflict(
        'HANDOVER_INVALID_STATE',
        'Handover hanya tersedia untuk General Voice berstatus Open yang belum ditugaskan',
      );
    return voice;
  }

  private async buildHandoverOptions(db: PrismaService | Prisma.TransactionClient, voice: any) {
    const categories = await db.generalVoiceCategory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { key: 'asc' },
      include: {
        revisions: { where: { effectiveTo: null }, take: 1 },
        routes: { where: { effectiveTo: null }, take: 2 },
      },
    });
    const options = await Promise.all(
      categories.map(async (category) => {
        const revision = category.revisions[0];
        const categoryRoute = category.routes[0];
        const reporterRoute =
          categoryRoute?.mode === GeneralVoiceCategoryRouteMode.RELATED_REPORTER_DEPARTMENT;
        const targetUnitId = reporterRoute
          ? voice.reporterOrganizationUnitId
          : categoryRoute?.organizationUnitId;
        const department = targetUnitId
          ? await db.organizationUnit.findUnique({ where: { id: targetUnitId } })
          : null;
        const mappings = targetUnitId
          ? await db.routeMapping.findMany({
              where: {
                organizationUnitId: targetUnitId,
                kind: { in: [RouteKind.DEPARTMENT_HEAD, RouteKind.DEFAULT_DEPARTMENT] },
                effectiveTo: null,
                owner: { status: AccountStatus.ACTIVE },
              },
              orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
              take: 2,
              include: { owner: { select: { id: true, displayName: true } } },
            })
          : [];
        if (mappings.length === 1 && mappings[0]!.ownerAccountId === voice.routeOwnerId)
          return null;
        const reason =
          category.routes.length > 1
            ? 'Kategori memiliki lebih dari satu konfigurasi route aktif.'
            : !categoryRoute
              ? 'Kategori belum memiliki konfigurasi route.'
              : !targetUnitId || !department
                ? 'Department tujuan belum tersedia.'
                : mappings.length === 0
                  ? 'PIC department tujuan belum tersedia.'
                  : mappings.length > 1
                    ? 'Terdapat lebih dari satu PIC aktif pada department tujuan.'
                    : !revision
                      ? 'Nama kategori belum tersedia.'
                      : null;
        const mapping = mappings.length === 1 ? mappings[0]! : null;
        return {
          category: {
            id: category.id,
            key: category.key,
            name: revision?.name ?? category.key,
          },
          routeMode: categoryRoute?.mode ?? null,
          department,
          pic: mapping
            ? {
                id: mapping.owner.id,
                displayName: mapping.owner.displayName,
                type:
                  mapping.kind === RouteKind.DEPARTMENT_HEAD ? 'DEPARTMENT_HEAD' : 'DEFAULT_PIC',
              }
            : null,
          isReporterDepartment: reporterRoute,
          available: reason === null,
          disabledReason: reason,
        };
      }),
    );
    return options.filter((option): option is NonNullable<typeof option> => option !== null);
  }

  private async resolveHandoverDestination(
    db: Prisma.TransactionClient,
    reporterOrganizationUnitId: string | null,
    categoryId: string,
  ) {
    const category = await db.generalVoiceCategory.findUnique({
      where: { id: categoryId },
      include: {
        revisions: { where: { effectiveTo: null }, take: 1 },
        routes: { where: { effectiveTo: null }, take: 2 },
      },
    });
    if (!category || category.status !== 'ACTIVE' || !category.revisions[0])
      throw conflict(
        'HANDOVER_CATEGORY_CONFIGURATION_CHANGED',
        'Kategori tujuan berubah atau tidak lagi aktif; muat ulang pilihan handover',
      );
    if (category.routes.length !== 1)
      throw conflict(
        'HANDOVER_CATEGORY_CONFIGURATION_CHANGED',
        'Konfigurasi route kategori berubah; muat ulang pilihan handover',
      );
    const categoryRoute = category.routes[0];
    if (!categoryRoute)
      throw conflict('HANDOVER_DESTINATION_UNAVAILABLE', 'Kategori tujuan belum memiliki route');
    const isReporterDepartment =
      categoryRoute.mode === GeneralVoiceCategoryRouteMode.RELATED_REPORTER_DEPARTMENT;
    const targetUnitId = isReporterDepartment
      ? reporterOrganizationUnitId
      : categoryRoute.organizationUnitId;
    if (!targetUnitId)
      throw conflict(
        'HANDOVER_DESTINATION_UNAVAILABLE',
        'Department tujuan handover belum tersedia',
      );
    const department = await db.organizationUnit.findUnique({ where: { id: targetUnitId } });
    if (!department)
      throw conflict(
        'HANDOVER_DESTINATION_UNAVAILABLE',
        'Department tujuan handover tidak ditemukan',
      );
    const mappings = await db.routeMapping.findMany({
      where: {
        organizationUnitId: targetUnitId,
        kind: { in: [RouteKind.DEPARTMENT_HEAD, RouteKind.DEFAULT_DEPARTMENT] },
        effectiveTo: null,
        owner: { status: AccountStatus.ACTIVE },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      take: 2,
      include: { owner: { select: { id: true, displayName: true } } },
    });
    if (mappings.length !== 1)
      throw conflict(
        'HANDOVER_DESTINATION_UNAVAILABLE',
        mappings.length
          ? 'Department tujuan memiliki lebih dari satu PIC aktif'
          : 'PIC department tujuan belum tersedia',
      );
    const mapping = mappings[0]!;
    return {
      category: {
        id: category.id,
        key: category.key,
        name: category.revisions[0]!.name,
      },
      department,
      pic: mapping.owner,
      picType: mapping.kind === RouteKind.DEPARTMENT_HEAD ? 'DEPARTMENT_HEAD' : 'DEFAULT_PIC',
      routeMappingId: mapping.id,
      routeMode: categoryRoute.mode,
      isReporterDepartment,
    };
  }

  private handoverShape(actor: AuthActor, record: any) {
    const participant = record.fromPicId === actor.accountId || record.toPicId === actor.accountId;
    return {
      id: record.id,
      sequence: record.sequence,
      from: {
        category: {
          id: record.fromCategoryId,
          key: record.fromCategoryKey,
          name: record.fromCategoryNameSnapshot,
        },
        department: {
          id: record.fromOrganizationUnitId,
          directorate: record.fromDirectorateSnapshot,
          division: record.fromDivisionSnapshot,
          department: record.fromDepartmentSnapshot,
        },
        pic: record.fromPic,
      },
      to: {
        category: {
          id: record.toCategoryId,
          key: record.toCategoryKey,
          name: record.toCategoryNameSnapshot,
        },
        department: {
          id: record.toOrganizationUnitId,
          directorate: record.toDirectorateSnapshot,
          division: record.toDivisionSnapshot,
          department: record.toDepartmentSnapshot,
        },
        pic: record.toPic,
      },
      routeMode: record.routeMode,
      isReporterDepartment: record.isReporterDepartment,
      createdAt: record.createdAt,
      ...(participant ? { detail: record.detail } : {}),
    };
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
  private async lockedActionVoice(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    id: string,
    expectedVersion: number,
  ) {
    await tx.$queryRaw`SELECT "id"::text FROM "Voice" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const voice = await tx.voice.findUnique({
      where: { id },
      include: { conversation: { select: { id: true } } },
    });
    if (!voice) throw forbiddenAsNotFound();
    if (voice.version !== expectedVersion)
      throw conflict('VERSION_CONFLICT', 'Voice version changed');
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
  private actionSet(
    actor: AuthActor,
    voice: {
      reporterId: string;
      routeOwnerId: string;
      currentHandlerId: string | null;
      visibility: VoiceVisibility;
      status: VoiceStatus;
      handlerType: HandlerType;
      closureCycles?: Array<{
        reopenedAt: Date | null;
        rating?: { score: number } | null;
      }>;
      conversation?: { id: string } | null;
    },
  ) {
    return computeAvailableActions(
      { accountId: actor.accountId, capabilities: actor.capabilities } satisfies ActionActor,
      { ...voice, hasConversation: Boolean(voice.conversation) },
    );
  }
  private conversationState(
    actor: AuthActor,
    voice: {
      reporterId: string;
      routeOwnerId: string;
      currentHandlerId: string | null;
      visibility: VoiceVisibility;
      status: VoiceStatus;
      handlerType: HandlerType;
      conversation?: { id: string } | null;
      closureCycles?: Array<{ reopenedAt: Date | null; rating?: { score: number } | null }>;
    },
  ): 'UNAVAILABLE' | 'ACTIVE' | 'READ_ONLY' {
    if (voice.status === VoiceStatus.OPEN) return 'UNAVAILABLE';
    const hasConversation = Boolean(voice.conversation);
    if (voice.status !== VoiceStatus.IN_VERIFICATION && !hasConversation) return 'UNAVAILABLE';
    const actions = this.actionSet(actor, voice);
    return actions.includes('MESSAGE') ? 'ACTIVE' : 'READ_ONLY';
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
      category: voice.currentCategoryKey ?? voice.categoryKey,
      categoryNameSnapshot: voice.currentCategoryNameSnapshot ?? voice.categoryNameSnapshot,
      classificationCategory: voice.categoryKey
        ? { key: voice.categoryKey, name: voice.categoryNameSnapshot }
        : null,
      severity: voice.severity,
      status: voice.status,
      version: voice.version,
      submittedAt: voice.submittedAt,
      updatedAt: voice.updatedAt,
      classificationSource: voice.classification?.source ?? null,
      routeOwner: voice.routeOwner,
      currentHandler: voice.currentHandler,
      attachments: voice.attachments,
      locationReview: voice.locationReview,
      closureCycles: (voice.closureCycles ?? []).map((cycle: any) => ({
        id: cycle.id,
        cycleNumber: cycle.cycleNumber,
        note: cycle.note,
        closedAt: cycle.closedAt,
        reopenedAt: cycle.reopenedAt,
        reviewState: cycle.reviewState,
        reviewDeadline: cycle.reviewDeadline,
        reviewResolvedAt: cycle.reviewResolvedAt,
        actor: cycle.actor,
        evidence: cycle.evidence,
        rating: cycle.rating
          ? {
              score: cycle.rating.score,
              feedback: cycle.rating.feedback,
              reopen: cycle.rating.reopen,
              createdAt: cycle.rating.createdAt,
            }
          : null,
      })),
      availableActions: this.actionSet(actor, voice),
      conversationState: this.conversationState(actor, voice),
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
  private assertStatusFilter(status?: VoiceStatus, group?: 'ACTIVE' | 'CLOSED' | 'ALL') {
    if (status && group)
      throw badRequest('STATUS_FILTER_CONFLICT', 'status and statusGroup cannot be combined');
    if (group && !['ACTIVE', 'CLOSED', 'ALL'].includes(group))
      throw badRequest('STATUS_FILTER_INVALID', 'statusGroup must be ACTIVE, CLOSED, or ALL');
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
    body = 'Ada pembaruan Voice di CARE',
  ) {
    const notification = await tx.notification.create({
      data: {
        recipientId,
        voiceId,
        type,
        title,
        body,
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
