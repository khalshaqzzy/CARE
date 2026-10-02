import { Inject, Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { PolicyService } from '../auth/policy.service';
import { badRequest, conflict, forbiddenAsNotFound } from '../common/errors';
import { parse } from '../common/validation';
import { loadConfig } from '../config';
import { jakartaDateKey } from '../escalation/working-time';
import { PrismaService } from '../prisma.service';
import { dayDate, substituteCandidates } from './away';

const MAX_DAYS = 60;
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const awaySchema = z
  .object({ startsOn: dateKey, endsOn: dateKey, substituteId: z.string().uuid() })
  .strict();

/** "Sedang tidak masuk" for Group Leaders and above. */
@Injectable()
export class AwayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}

  /** The open period (active or upcoming) and the eligible substitutes. */
  async get(actor: AuthActor) {
    const { level, candidates } = await substituteCandidates(this.prisma, actor.accountId);
    if (!level) return { eligible: false, current: null, candidates: [] };
    return { eligible: true, current: await this.current(actor.accountId), candidates };
  }

  async set(actor: AuthActor, input: unknown) {
    const data = parse(awaySchema, input);
    const { level, candidates } = await substituteCandidates(this.prisma, actor.accountId);
    if (!level) throw forbiddenAsNotFound();
    const today = jakartaDateKey(new Date());
    if (data.startsOn < today || data.endsOn < data.startsOn)
      throw badRequest('AWAY_PERIOD_INVALID', 'Periode tidak valid.');
    const days = (dayDate(data.endsOn).getTime() - dayDate(data.startsOn).getTime()) / 86_400_000;
    if (days + 1 > MAX_DAYS)
      throw badRequest('AWAY_PERIOD_TOO_LONG', `Periode maksimal ${MAX_DAYS} hari.`);
    const substitute = candidates.find((candidate) => candidate.id === data.substituteId);
    if (!substitute) throw badRequest('AWAY_SUBSTITUTE_INVALID', 'Pilih pengganti yang tersedia.');
    await this.prisma.$transaction(async (tx) => {
      // One open period at a time: a new one replaces it.
      await tx.awayPeriod.updateMany({
        where: { accountId: actor.accountId, endedAt: null },
        data: { endedAt: new Date() },
      });
      const period = await tx.awayPeriod.create({
        data: {
          accountId: actor.accountId,
          substituteId: substitute.id,
          startsOn: dayDate(data.startsOn),
          endsOn: dayDate(data.endsOn),
        },
      });
      const self = await tx.userAccount.findUniqueOrThrow({
        where: { id: actor.accountId },
        select: { displayName: true },
      });
      await tx.notification.create({
        data: {
          recipientId: substitute.id,
          type: NotificationType.AWAY_SUBSTITUTE,
          title: 'Anda menjadi pengganti',
          body: `${self.displayName} sedang tidak masuk ${data.startsOn} – ${data.endsOn}.`,
          deepLink: '/work-items',
        },
      });
      await this.audit(tx, actor, 'AWAY_PERIOD_SET', period.id, {
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        substituteId: substitute.id,
      });
    });
    return this.get(actor);
  }

  /** "Aktif kembali": ends the open period now. */
  async end(actor: AuthActor) {
    const current = await this.current(actor.accountId);
    if (!current) throw conflict('AWAY_PERIOD_NOT_FOUND', 'Tidak ada periode tidak masuk.');
    await this.prisma.$transaction(async (tx) => {
      await tx.awayPeriod.update({ where: { id: current.id }, data: { endedAt: new Date() } });
      await this.audit(tx, actor, 'AWAY_PERIOD_ENDED', current.id, {});
    });
    return this.get(actor);
  }

  private async current(accountId: string) {
    const today = dayDate(jakartaDateKey(new Date()));
    const period = await this.prisma.awayPeriod.findFirst({
      where: { accountId, endedAt: null, endsOn: { gte: today } },
      orderBy: { createdAt: 'desc' },
      include: { substitute: { select: { id: true, displayName: true } } },
    });
    if (!period) return null;
    return {
      id: period.id,
      startsOn: period.startsOn.toISOString().slice(0, 10),
      endsOn: period.endsOn.toISOString().slice(0, 10),
      active: period.startsOn <= today,
      substitute: period.substitute,
    };
  }

  private audit(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    actor: AuthActor,
    action: string,
    resourceId: string,
    summary: object,
  ) {
    return tx.auditEvent.create({
      data: {
        actorId: actor.accountId,
        ...this.policy.actorSnapshot(actor),
        action,
        result: 'SUCCESS',
        resourceType: 'AWAY_PERIOD',
        resourceId,
        summary,
        correlationId: `away:${resourceId}`,
        releaseSha: loadConfig().RELEASE_SHA,
      },
    });
  }
}
