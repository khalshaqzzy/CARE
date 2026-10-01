import { Injectable } from '@nestjs/common';
import { CalendarDayKind, EscalationTimeUnit, Prisma, Severity } from '@prisma/client';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import type { WorkingCalendar } from './working-time';

const CALENDAR_ID = 'default';
const SEVERITY_ORDER: Severity[] = [
  Severity.LOW,
  Severity.MEDIUM,
  Severity.HIGH,
  Severity.CRITICAL,
];
// Upper bounds keep a misconfiguration from parking a Voice for months.
const MAX_AMOUNT: Record<EscalationTimeUnit, number> = {
  WORKING_DAY: 30,
  CALENDAR_HOUR: 720,
};

const calendarSchema = z
  .object({ useStandard: z.boolean(), expectedVersion: z.number().int().positive() })
  .strict();
const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.nativeEnum(CalendarDayKind),
    label: z.string().trim().min(1).max(120),
  })
  .strict();
const deadlinesSchema = z
  .object({
    deadlines: z
      .array(
        z
          .object({
            severity: z.nativeEnum(Severity),
            respondAmount: z.number().int().min(1),
            processAmount: z.number().int().min(1),
            unit: z.nativeEnum(EscalationTimeUnit),
            expectedVersion: z.number().int().positive(),
          })
          .strict(),
      )
      .length(4),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.deadlines.map((row) => row.severity)).size !== 4)
      context.addIssue({ code: 'custom', message: 'Each severity exactly once' });
    for (const row of value.deadlines)
      if (row.respondAmount > MAX_AMOUNT[row.unit] || row.processAmount > MAX_AMOUNT[row.unit])
        context.addIssue({ code: 'custom', message: `Amount too large for ${row.severity}` });
  });

/**
 * Admin-managed working calendar and per-severity respond/process windows used
 * by tiered Voice escalation. Changes apply to deadlines computed afterwards.
 */
@Injectable()
export class EscalationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const [setting, exceptions, deadlines] = await Promise.all([
      this.prisma.workingCalendarSetting.upsert({
        where: { id: CALENDAR_ID },
        create: { id: CALENDAR_ID },
        update: {},
      }),
      this.prisma.workingCalendarException.findMany({ orderBy: { date: 'asc' } }),
      this.prisma.escalationDeadline.findMany(),
    ]);
    return {
      calendar: {
        useStandard: setting.useStandard,
        version: setting.version,
        updatedAt: setting.updatedAt,
        exceptions: exceptions.map((row) => ({
          id: row.id,
          date: row.date.toISOString().slice(0, 10),
          kind: row.kind,
          label: row.label,
        })),
      },
      deadlines: SEVERITY_ORDER.map((severity) =>
        deadlines.find((row) => row.severity === severity),
      )
        .filter((row): row is NonNullable<typeof row> => !!row)
        .map((row) => ({
          severity: row.severity,
          respondAmount: row.respondAmount,
          processAmount: row.processAmount,
          unit: row.unit,
          version: row.version,
          updatedAt: row.updatedAt,
        })),
    };
  }

  /** Calendar snapshot for deadline arithmetic. */
  async workingCalendar(): Promise<WorkingCalendar> {
    const settings = await this.get();
    return {
      useStandard: settings.calendar.useStandard,
      exceptions: new Map(settings.calendar.exceptions.map((row) => [row.date, row.kind])),
    };
  }

  async updateCalendar(actor: AuthActor, body: unknown) {
    const data = this.parse(calendarSchema, body);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workingCalendarSetting.updateMany({
        where: { id: CALENDAR_ID, version: data.expectedVersion },
        data: {
          useStandard: data.useStandard,
          version: { increment: 1 },
          updatedById: actor.accountId,
        },
      });
      if (claimed.count !== 1)
        throw conflict('CALENDAR_VERSION_CONFLICT', 'Kalender kerja telah berubah; muat ulang');
      await this.audit(tx, actor, 'WORKING_CALENDAR_UPDATED', CALENDAR_ID, {
        useStandard: data.useStandard,
      });
    });
    return this.get();
  }

  async addException(actor: AuthActor, body: unknown) {
    const data = this.parse(exceptionSchema, body);
    const date = new Date(`${data.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.date)
      throw badRequest('CALENDAR_DATE_INVALID', 'Tanggal tidak valid');
    await this.prisma.$transaction(async (tx) => {
      if (await tx.workingCalendarException.findUnique({ where: { date } }))
        throw conflict('CALENDAR_DATE_EXISTS', 'Tanggal ini sudah memiliki pengaturan khusus');
      const row = await tx.workingCalendarException.create({
        data: { date, kind: data.kind, label: data.label, createdById: actor.accountId },
      });
      await this.audit(tx, actor, 'WORKING_CALENDAR_EXCEPTION_ADDED', row.id, {
        date: data.date,
        kind: data.kind,
      });
    });
    return this.get();
  }

  async removeException(actor: AuthActor, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.workingCalendarException.findUnique({ where: { id } });
      if (!row) throw forbiddenAsNotFound();
      await tx.workingCalendarException.delete({ where: { id } });
      await this.audit(tx, actor, 'WORKING_CALENDAR_EXCEPTION_REMOVED', id, {
        date: row.date.toISOString().slice(0, 10),
        kind: row.kind,
      });
    });
    return this.get();
  }

  async updateDeadlines(actor: AuthActor, body: unknown) {
    const data = this.parse(deadlinesSchema, body);
    await this.prisma.$transaction(async (tx) => {
      for (const row of data.deadlines) {
        const claimed = await tx.escalationDeadline.updateMany({
          where: { severity: row.severity, version: row.expectedVersion },
          data: {
            respondAmount: row.respondAmount,
            processAmount: row.processAmount,
            unit: row.unit,
            version: { increment: 1 },
            updatedById: actor.accountId,
          },
        });
        if (claimed.count !== 1)
          throw conflict('DEADLINE_VERSION_CONFLICT', 'Batas waktu telah berubah; muat ulang');
      }
      await this.audit(tx, actor, 'ESCALATION_DEADLINES_UPDATED', 'deadlines', {
        deadlines: data.deadlines.map(({ severity, respondAmount, processAmount, unit }) => ({
          severity,
          respondAmount,
          processAmount,
          unit,
        })),
      });
    });
    return this.get();
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Request validation failed');
    return parsed.data;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthActor,
    action: string,
    resourceId: string,
    summary: Prisma.InputJsonValue,
  ) {
    return tx.auditEvent.create({
      data: {
        actorId: actor.accountId,
        actorAccountKind: actor.accountKind,
        actorStructuralPosition: actor.structuralPosition,
        actorCapabilities: actor.capabilities,
        action,
        result: 'SUCCESS',
        resourceType: 'ESCALATION_SETTINGS',
        resourceId,
        summary,
        correlationId: crypto.randomUUID(),
        releaseSha: process.env.RELEASE_SHA ?? 'development',
      },
    });
  }
}
