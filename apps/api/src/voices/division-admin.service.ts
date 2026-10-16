import { Inject, Injectable } from '@nestjs/common';
import { Prisma, VoiceStatus, VoiceVisibility } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { AuthActor } from '../auth/auth.types';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { VoicesService } from './voices.service';

const EXPORT_LIMIT = 5000;
const TREND_WEEKS = 8;
const TOP = 5;
const WIB_OFFSET_MS = 7 * 3_600_000;

/** Monday (WIB) of the week `weeksAgo` weeks before the current one, as YYYY-MM-DD. */
function wibWeekStart(now: Date, weeksAgo: number) {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const monday =
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) -
    ((wib.getUTCDay() + 6) % 7) * 86_400_000;
  return new Date(monday - weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10);
}
const statusLabel: Record<VoiceStatus, string> = {
  OPEN: 'Terbuka',
  RESPONDED: 'Direspons',
  IN_PROGRESS: 'Diproses',
  CLOSED: 'Selesai',
};
const active = [VoiceStatus.OPEN, VoiceStatus.RESPONDED, VoiceStatus.IN_PROGRESS];

export type DivisionExportQuery = {
  status?: string;
  statusGroup?: string;
  severity?: string;
  due?: string;
  from?: string;
  to?: string;
};

/**
 * Division Admin: a CARE Admin-app account that reads one division's General
 * Voices (with chat) and exports them. It never acts on a Voice; Private
 * Voices of the division are only counted.
 */
@Injectable()
export class DivisionAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VoicesService) private readonly voices: VoicesService,
  ) {}

  private scope(actor: AuthActor) {
    if (!actor.capabilities.includes('DIVISION_ADMIN') || !actor.directorate || !actor.division)
      throw forbiddenAsNotFound();
    return { directorate: actor.directorate, division: actor.division };
  }

  private general(scope: { directorate: string; division: string }): Prisma.VoiceWhereInput {
    return {
      visibility: VoiceVisibility.GENERAL,
      reporterDirectorateSnapshot: scope.directorate,
      reporterDivisionSnapshot: scope.division,
    };
  }

  async overview(actor: AuthActor) {
    const scope = this.scope(actor);
    const where = this.general(scope);
    const dueCount = (due: 'OVERDUE' | 'SOON') =>
      this.voices
        .dueFilter(due)
        .then((filter) => this.prisma.voice.count({ where: { AND: [where, filter] } }));
    const [grouped, overdue, dueSoon, critical, privateTotal, privateActive] = await Promise.all([
      this.prisma.voice.groupBy({ by: ['status'], where, _count: { _all: true } }),
      dueCount('OVERDUE'),
      dueCount('SOON'),
      this.prisma.voice.count({
        where: { ...where, severity: 'CRITICAL', status: { in: active } },
      }),
      this.prisma.voice.count({ where: { ...where, visibility: VoiceVisibility.PRIVATE } }),
      this.prisma.voice.count({
        where: { ...where, visibility: VoiceVisibility.PRIVATE, status: { in: active } },
      }),
    ]);
    const count = (status: VoiceStatus) =>
      grouped.find((group) => group.status === status)?._count._all ?? 0;
    return {
      directorate: scope.directorate,
      division: scope.division,
      general: {
        total: grouped.reduce((sum, group) => sum + group._count._all, 0),
        open: count(VoiceStatus.OPEN),
        responded: count(VoiceStatus.RESPONDED),
        inProgress: count(VoiceStatus.IN_PROGRESS),
        closed: count(VoiceStatus.CLOSED),
        overdue,
        dueSoon,
        critical,
      },
      private: { total: privateTotal, active: privateActive },
      ...(await this.insights(scope, where)),
    };
  }

  /** Short summary for the Voice page: trend, severity, destinations and top people. */
  private async insights(
    scope: { directorate: string; division: string },
    where: Prisma.VoiceWhereInput,
    now = new Date(),
  ) {
    const first = wibWeekStart(now, TREND_WEEKS - 1);
    const since = new Date(Date.parse(`${first}T00:00:00Z`) - WIB_OFFSET_MS);
    const [weeks, severities, destinations, reporters, handlers] = await Promise.all([
      this.prisma.$queryRaw<{ week: string; count: number }[]>`
        SELECT to_char(date_trunc('week', "submittedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS "week",
          COUNT(*)::int AS "count"
        FROM "Voice"
        WHERE "visibility" = 'GENERAL'
          AND "reporterDirectorateSnapshot" = ${scope.directorate}
          AND "reporterDivisionSnapshot" = ${scope.division}
          AND "submittedAt" >= ${since}
        GROUP BY 1`,
      this.prisma.voice.groupBy({ by: ['severity'], where, _count: { _all: true } }),
      this.prisma.voice.groupBy({
        by: ['handlingDepartmentSnapshot'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: TOP,
      }),
      this.prisma.voice.groupBy({
        by: ['reporterId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: TOP,
      }),
      this.prisma.voice.groupBy({
        by: ['currentHandlerId'],
        where: { ...where, currentHandlerId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: TOP,
      }),
    ]);
    const handlerIds = handlers.map((row) => row.currentHandlerId!);
    const [reporterNames, handlerNames, closed] = await Promise.all([
      this.prisma.voice.findMany({
        where: { ...where, reporterId: { in: reporters.map((row) => row.reporterId) } },
        distinct: ['reporterId'],
        orderBy: { submittedAt: 'desc' },
        select: { reporterId: true, reporterNameSnapshot: true, reporterDepartmentSnapshot: true },
      }),
      this.prisma.userAccount.findMany({
        where: { id: { in: handlerIds } },
        select: { id: true, displayName: true },
      }),
      this.prisma.voice.groupBy({
        by: ['currentHandlerId'],
        where: { ...where, currentHandlerId: { in: handlerIds }, status: VoiceStatus.CLOSED },
        _count: { _all: true },
      }),
    ]);
    const severity = (value: string) =>
      severities.find((row) => row.severity === value)?._count._all ?? 0;
    return {
      trend: Array.from({ length: TREND_WEEKS }, (_, index) => {
        const weekStart = wibWeekStart(now, TREND_WEEKS - 1 - index);
        return { weekStart, count: weeks.find((row) => row.week === weekStart)?.count ?? 0 };
      }),
      severity: {
        low: severity('LOW'),
        medium: severity('MEDIUM'),
        high: severity('HIGH'),
        critical: severity('CRITICAL'),
      },
      destinations: destinations.map((row) => ({
        department: row.handlingDepartmentSnapshot,
        count: row._count.id,
      })),
      topReporters: reporters.map((row) => {
        const reporter = reporterNames.find((name) => name.reporterId === row.reporterId);
        return {
          name: reporter?.reporterNameSnapshot ?? '-',
          department: reporter?.reporterDepartmentSnapshot ?? null,
          count: row._count.id,
        };
      }),
      topResponders: handlers.map((row) => ({
        name: handlerNames.find((name) => name.id === row.currentHandlerId)?.displayName ?? '-',
        count: row._count.id,
        closed:
          closed.find((done) => done.currentHandlerId === row.currentHandlerId)?._count._all ?? 0,
      })),
    };
  }

  async export(actor: AuthActor, query: DivisionExportQuery, correlationId: string) {
    const scope = this.scope(actor);
    const and: Prisma.VoiceWhereInput[] = [this.general(scope)];
    if (query.status) {
      if (!(query.status in statusLabel))
        throw badRequest('STATUS_FILTER_INVALID', 'Unknown status');
      and.push({ status: query.status as VoiceStatus });
    } else if (query.statusGroup === 'ACTIVE') and.push({ status: { in: active } });
    else if (query.statusGroup === 'CLOSED') and.push({ status: VoiceStatus.CLOSED });
    if (query.severity) {
      if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(query.severity))
        throw badRequest('SEVERITY_FILTER_INVALID', 'Unknown severity');
      and.push({ severity: query.severity as never });
    }
    if (query.due) and.push(await this.voices.dueFilter(query.due));
    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      if ([from, to].some((value) => value && Number.isNaN(value.getTime())))
        throw badRequest('DATE_FILTER_INVALID', 'from/to must be dates');
      and.push({ submittedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
    }
    const where: Prisma.VoiceWhereInput = { AND: and };
    const total = await this.prisma.voice.count({ where });
    if (total > EXPORT_LIMIT)
      throw badRequest(
        'EXPORT_TOO_LARGE',
        `Maksimal ${EXPORT_LIMIT} Voice per ekspor; persempit filter.`,
      );
    const voices = await this.prisma.voice.findMany({
      where,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        displayId: true,
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
        reporterDepartmentSnapshot: true,
        reporterSectionSnapshot: true,
        reporterPositionSnapshot: true,
        submittedAt: true,
        updatedAt: true,
        tierDueAt: true,
        routeOwner: { select: { displayName: true } },
        currentHandler: { select: { displayName: true } },
        conversation: {
          select: {
            messages: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                createdAt: true,
                kind: true,
                text: true,
                senderNameSnapshot: true,
                senderStructuralPosition: true,
                sender: { select: { displayName: true } },
                _count: { select: { attachments: true } },
              },
            },
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CARE';
    const voiceSheet = workbook.addWorksheet('Voice');
    voiceSheet.columns = [
      { header: 'ID Voice', key: 'displayId', width: 22 },
      { header: 'Dikirim', key: 'submittedAt', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Tingkat', key: 'severity', width: 10 },
      { header: 'Kategori', key: 'category', width: 24 },
      { header: 'Judul', key: 'title', width: 40 },
      { header: 'Detail', key: 'detail', width: 60 },
      { header: 'Area', key: 'area', width: 14 },
      { header: 'Lokasi', key: 'location', width: 24 },
      { header: 'No. Reg pelapor', key: 'noReg', width: 14 },
      { header: 'Nama pelapor', key: 'reporter', width: 24 },
      { header: 'Departemen', key: 'department', width: 24 },
      { header: 'Seksi', key: 'section', width: 20 },
      { header: 'Posisi', key: 'position', width: 18 },
      { header: 'Penanggung jawab rute', key: 'routeOwner', width: 24 },
      { header: 'PIC', key: 'handler', width: 24 },
      { header: 'Batas tahap', key: 'dueAt', width: 18 },
      { header: 'Diperbarui', key: 'updatedAt', width: 18 },
    ];
    const chatSheet = workbook.addWorksheet('Chat');
    chatSheet.columns = [
      { header: 'ID Voice', key: 'displayId', width: 22 },
      { header: 'Waktu', key: 'createdAt', width: 18 },
      { header: 'Pengirim', key: 'sender', width: 24 },
      { header: 'Posisi', key: 'position', width: 18 },
      { header: 'Jenis', key: 'kind', width: 10 },
      { header: 'Pesan', key: 'text', width: 80 },
      { header: 'Lampiran', key: 'attachments', width: 10 },
    ];
    for (const voice of voices) {
      voiceSheet.addRow({
        displayId: voice.displayId,
        submittedAt: voice.submittedAt,
        status: statusLabel[voice.status],
        severity: voice.severity,
        category: voice.currentCategoryNameSnapshot ?? voice.categoryNameSnapshot ?? '',
        title: voice.title,
        detail: voice.detail,
        area: voice.area,
        location: voice.locationDetail,
        noReg: voice.reporterNoRegSnapshot,
        reporter: voice.reporterNameSnapshot,
        department: voice.reporterDepartmentSnapshot,
        section: voice.reporterSectionSnapshot ?? '',
        position: voice.reporterPositionSnapshot ?? '',
        routeOwner: voice.routeOwner.displayName,
        handler: voice.currentHandler?.displayName ?? '',
        dueAt: voice.tierDueAt ?? '',
        updatedAt: voice.updatedAt,
      });
      for (const message of voice.conversation?.messages ?? [])
        chatSheet.addRow({
          displayId: voice.displayId,
          createdAt: message.createdAt,
          sender: message.senderNameSnapshot ?? message.sender.displayName,
          position: message.senderStructuralPosition ?? '',
          kind: message.kind === 'SYSTEM' ? 'Sistem' : 'Pesan',
          text: message.text ?? '',
          attachments: message._count.attachments,
        });
    }
    for (const sheet of [voiceSheet, chatSheet]) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      for (const column of sheet.columns)
        if (['submittedAt', 'updatedAt', 'dueAt', 'createdAt'].includes(String(column.key)))
          column.numFmt = 'dd/mm/yyyy hh:mm';
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await this.prisma.auditEvent.create({
      data: {
        actorId: actor.accountId,
        actorAccountKind: actor.accountKind,
        actorCapabilities: actor.capabilities,
        action: 'DIVISION_VOICE_EXPORT',
        result: 'SUCCESS',
        resourceType: 'DIVISION',
        resourceId: scope.division.slice(0, 100),
        summary: {
          directorate: scope.directorate,
          division: scope.division,
          filters: Object.fromEntries(Object.entries(query).filter(([, value]) => value)),
          voices: voices.length,
        },
        correlationId,
        releaseSha: loadConfig().RELEASE_SHA,
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = scope.division.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'divisi';
    return { buffer, filename: `voice-${slug}-${stamp}.xlsx` };
  }
}
