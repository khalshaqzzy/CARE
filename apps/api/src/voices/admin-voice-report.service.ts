import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Severity, VoiceStatus, VoiceVisibility } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { AuthActor } from '../auth/auth.types';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { OrganizationDashboard } from './dashboard';
import { VoicesService, type VoiceListQuery } from './voices.service';

const EXPORT_LIMIT = 10_000;
const STATUSES = [
  VoiceStatus.OPEN,
  VoiceStatus.RESPONDED,
  VoiceStatus.IN_PROGRESS,
  VoiceStatus.CLOSED,
] as const;
const SEVERITIES = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW] as const;
const statusLabel: Record<VoiceStatus, string> = {
  OPEN: 'Terbuka',
  RESPONDED: 'Direspons',
  IN_PROGRESS: 'Diproses',
  CLOSED: 'Selesai',
};

/** Browse filters of the Admin Voice summary and export; paging and sort do not apply. */
export type AdminVoiceReportQuery = Omit<VoiceListQuery, 'limit' | 'cursor' | 'sort'>;

/**
 * CARE Admin reporting over the Voice Explorer filters: one summary of the
 * filtered Voices (status, severity, category, area, overdue and the
 * dashboard's response / completion averages) and an Excel export of them.
 */
@Injectable()
export class AdminVoiceReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VoicesService) private readonly voices: VoicesService,
  ) {}

  private async where(actor: AuthActor, query: AdminVoiceReportQuery) {
    if (!actor.capabilities.includes('CARE_ADMIN')) throw forbiddenAsNotFound();
    // `due` needs the working calendar and is not part of the Admin filters.
    const { due: _due, ...filters } = query;
    void _due;
    return this.voices.listWhere(filters, {});
  }

  async summary(actor: AuthActor, query: AdminVoiceReportQuery) {
    const where = await this.where(actor, query);
    const [performance, byStatus, bySeverity, byArea, byCategory, byOrigin] = await Promise.all([
      new OrganizationDashboard(this.prisma).cohortPerformance(where),
      this.prisma.voice.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.voice.groupBy({ by: ['severity'], where, _count: { _all: true } }),
      this.prisma.voice.groupBy({ by: ['area'], where, _count: { _all: true } }),
      this.prisma.voice.groupBy({
        by: ['currentCategoryKey', 'categoryKey', 'currentCategoryNameSnapshot'],
        where: { AND: [where, { visibility: VoiceVisibility.GENERAL }] },
        _count: { _all: true },
      }),
      this.prisma.voice.groupBy({ by: ['legacySource'], where, _count: { _all: true } }),
    ]);
    const statusCount = new Map(byStatus.map((row) => [row.status, row._count._all]));
    const severityCount = new Map(bySeverity.map((row) => [row.severity, row._count._all]));
    const categories = await this.prisma.generalVoiceCategory.findMany({
      select: {
        key: true,
        revisions: { where: { effectiveTo: null }, select: { name: true }, take: 1 },
      },
    });
    const names = new Map(categories.map((c) => [c.key, c.revisions[0]?.name ?? c.key]));
    const category = new Map<string, { key: string; label: string; value: number }>();
    for (const row of byCategory) {
      const key = row.currentCategoryKey ?? row.categoryKey ?? 'NONE';
      const label =
        names.get(key) ??
        (key === 'NONE' ? 'Tanpa kategori' : (row.currentCategoryNameSnapshot ?? key));
      const entry = category.get(key) ?? { key, label, value: 0 };
      entry.value += row._count._all;
      category.set(key, entry);
    }
    return {
      total: performance.total,
      overdue: performance.overdue,
      migrated: byOrigin
        .filter((row) => row.legacySource !== null)
        .reduce((sum, row) => sum + row._count._all, 0),
      status: STATUSES.map((key) => ({ key, value: statusCount.get(key) ?? 0 })),
      severity: SEVERITIES.map((key) => ({ key, value: severityCount.get(key) ?? 0 })),
      area: byArea
        .map((row) => ({ key: row.area, value: row._count._all }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      category: [...category.values()].sort((a, b) => b.value - a.value),
      averageResponseSeconds: performance.averageResponseSeconds,
      responseSampleCount: performance.responseSampleCount,
      averageCompletionSeconds: performance.averageCompletionSeconds,
      completionSampleCount: performance.completionSampleCount,
      averageFeedbackScore: performance.averageFeedbackScore,
      feedbackSampleCount: performance.feedbackSampleCount,
    };
  }

  async export(actor: AuthActor, query: AdminVoiceReportQuery, correlationId: string) {
    const where = await this.where(actor, query);
    const total = await this.prisma.voice.count({ where });
    if (total > EXPORT_LIMIT)
      throw badRequest(
        'EXPORT_TOO_LARGE',
        `Maksimal ${EXPORT_LIMIT.toLocaleString('id-ID')} Voice per ekspor; persempit filter.`,
      );
    const voices = await this.prisma.voice.findMany({
      where,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        displayId: true,
        legacySource: true,
        legacyId: true,
        visibility: true,
        title: true,
        detail: true,
        status: true,
        severity: true,
        area: true,
        locationDetail: true,
        categoryNameSnapshot: true,
        currentCategoryNameSnapshot: true,
        reporterNoRegSnapshot: true,
        reporterNameSnapshot: true,
        reporterDivisionSnapshot: true,
        reporterDepartmentSnapshot: true,
        handlingDepartmentSnapshot: true,
        submittedAt: true,
        updatedAt: true,
        routeOwner: { select: { displayName: true } },
        currentHandler: { select: { displayName: true } },
        closureCycles: {
          orderBy: { cycleNumber: 'desc' },
          take: 1,
          select: { closedAt: true, rating: { select: { score: true } } },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CARE';
    const sheet = workbook.addWorksheet('Voice');
    sheet.columns = [
      { header: 'ID Voice', key: 'displayId', width: 22 },
      { header: 'Asal', key: 'origin', width: 12 },
      { header: 'ID lama', key: 'legacyId', width: 18 },
      { header: 'Visibility', key: 'visibility', width: 10 },
      { header: 'Dikirim', key: 'submittedAt', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Severity', key: 'severity', width: 10 },
      { header: 'Kategori', key: 'category', width: 24 },
      { header: 'Judul', key: 'title', width: 40 },
      { header: 'Detail', key: 'detail', width: 60 },
      { header: 'Area', key: 'area', width: 14 },
      { header: 'Lokasi', key: 'location', width: 24 },
      { header: 'No. Reg pelapor', key: 'noReg', width: 14 },
      { header: 'Nama pelapor', key: 'reporter', width: 24 },
      { header: 'Divisi pelapor', key: 'division', width: 24 },
      { header: 'Departemen pelapor', key: 'department', width: 24 },
      { header: 'Departemen penanganan', key: 'handlingDepartment', width: 24 },
      { header: 'PIC', key: 'handler', width: 24 },
      { header: 'Selesai', key: 'closedAt', width: 18 },
      { header: 'Rating', key: 'rating', width: 8 },
      { header: 'Diperbarui', key: 'updatedAt', width: 18 },
    ];
    for (const voice of voices) {
      // Private reporters stay out of bulk files; their identity is read per Voice, audited.
      const general = voice.visibility === VoiceVisibility.GENERAL;
      const cycle = voice.closureCycles[0];
      sheet.addRow({
        displayId: voice.displayId,
        origin: voice.legacySource ?? 'CARE',
        legacyId: voice.legacyId ?? '',
        visibility: voice.visibility,
        submittedAt: voice.submittedAt,
        status: statusLabel[voice.status],
        severity: voice.severity,
        category: general
          ? (voice.currentCategoryNameSnapshot ?? voice.categoryNameSnapshot ?? '')
          : '',
        title: voice.title,
        detail: voice.detail,
        area: voice.area,
        location: voice.locationDetail,
        noReg: general ? voice.reporterNoRegSnapshot : '',
        reporter: general ? voice.reporterNameSnapshot : 'Private',
        division: general ? voice.reporterDivisionSnapshot : '',
        department: general ? voice.reporterDepartmentSnapshot : '',
        handlingDepartment: general ? (voice.handlingDepartmentSnapshot ?? '') : 'Komite',
        handler: general
          ? (voice.currentHandler?.displayName ?? voice.routeOwner.displayName)
          : 'Komite',
        closedAt: voice.status === VoiceStatus.CLOSED ? (cycle?.closedAt ?? '') : '',
        rating: cycle?.rating?.score ?? '',
        updatedAt: voice.updatedAt,
      });
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const column of sheet.columns)
      if (['submittedAt', 'updatedAt', 'closedAt'].includes(String(column.key)))
        column.numFmt = 'dd/mm/yyyy hh:mm';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await this.prisma.auditEvent.create({
      data: {
        actorId: actor.accountId,
        actorAccountKind: actor.accountKind,
        actorCapabilities: actor.capabilities,
        action: 'ADMIN_VOICE_EXPORT',
        result: 'SUCCESS',
        resourceType: 'VOICE',
        resourceId: 'export',
        summary: {
          filters: Object.fromEntries(Object.entries(query).filter(([, value]) => value)),
          voices: voices.length,
        } as Prisma.InputJsonValue,
        correlationId,
        releaseSha: loadConfig().RELEASE_SHA,
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const name = query.origin === 'MIGRATED' ? 'voice-migrasi' : 'voice';
    return { buffer, filename: `${name}-${stamp}.xlsx` };
  }
}
