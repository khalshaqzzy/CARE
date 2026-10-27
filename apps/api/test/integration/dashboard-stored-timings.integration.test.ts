import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ADR-0071: database triggers keep the dashboard's stored timings exact.
const db = new PrismaClient();
let accountId: string;
let voiceId: string;
const at = (iso: string) => new Date(iso);

async function event(type: 'MONITORED' | 'RESPONDED' | 'PROCEEDED', occurredAt: string) {
  await db.voiceEvent.create({
    data: {
      voiceId,
      type,
      actorId: accountId,
      actorAccountKind: 'WORKFORCE',
      actorCapabilities: ['MANAGER'],
      payload: {},
      occurredAt: at(occurredAt),
    },
  });
}

describe('Stored dashboard timings', () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe('TRUNCATE TABLE "UserAccount", "Employee" CASCADE');
    const employee = await db.employee.create({ data: { noReg: 'TIMING-1', name: 'Timing PIC' } });
    accountId = (
      await db.userAccount.create({
        data: {
          username: 'timing-1',
          displayName: 'Timing PIC',
          passwordHash: 'test',
          accountKind: 'WORKFORCE',
          employeeId: employee.id,
        },
      })
    ).id;
    voiceId = (
      await db.voice.create({
        data: {
          displayId: 'CARE-202610-990001',
          reporterId: accountId,
          visibility: 'GENERAL',
          area: 'KARAWANG_1',
          reporterNoRegSnapshot: 'TIMING-1',
          reporterNameSnapshot: 'Timing PIC',
          reporterDivisionSnapshot: 'Division T',
          reporterDepartmentSnapshot: 'Department T',
          routeOwnerId: accountId,
          severity: 'LOW',
          handlerType: 'MANAGER',
          title: 'Timing',
          detail: 'Timing',
          locationDetail: 'line',
          anonymousAlias: 'Timing-1',
          submittedAt: at('2026-10-01T00:00:00Z'),
        },
      })
    ).id;
  });
  afterAll(() => db.$disconnect());

  it('keeps the first and latest response per Voice, from any insert order', async () => {
    await event('PROCEEDED', '2026-10-01T01:00:00Z');
    expect(await db.voiceResponseTiming.findUnique({ where: { voiceId } })).toBeNull();

    await event('RESPONDED', '2026-10-01T05:00:00Z');
    await event('MONITORED', '2026-10-01T02:00:00Z');
    await event('RESPONDED', '2026-10-01T09:00:00Z');
    expect(await db.voiceResponseTiming.findUniqueOrThrow({ where: { voiceId } })).toMatchObject({
      firstResponseAt: at('2026-10-01T02:00:00Z'),
      lastResponseAt: at('2026-10-01T09:00:00Z'),
    });
  });

  it('starts cycle one at submit and later cycles at the previous reopen', async () => {
    const cycle = (cycleNumber: number, closedAt: string) =>
      db.closureCycle.create({
        data: { voiceId, cycleNumber, actorId: accountId, note: 'done', closedAt: at(closedAt) },
      });
    const first = await cycle(1, '2026-10-02T00:00:00Z');
    expect(first.startedAt).toEqual(at('2026-10-01T00:00:00Z'));

    await db.closureCycle.update({
      where: { id: first.id },
      data: { reopenedAt: at('2026-10-03T00:00:00Z') },
    });
    const second = await cycle(2, '2026-10-04T00:00:00Z');
    expect(second.startedAt).toEqual(at('2026-10-03T00:00:00Z'));

    // A corrected reopen time moves the next cycle's start with it.
    await db.closureCycle.update({
      where: { id: first.id },
      data: { reopenedAt: at('2026-10-03T06:00:00Z') },
    });
    expect(
      (await db.closureCycle.findUniqueOrThrow({ where: { id: second.id } })).startedAt,
    ).toEqual(at('2026-10-03T06:00:00Z'));
  });

  it('drops the timing row with its Voice', async () => {
    await db.voiceEvent.deleteMany({ where: { voiceId } });
    await db.closureCycle.deleteMany({ where: { voiceId } });
    await db.voice.delete({ where: { id: voiceId } });
    expect(await db.voiceResponseTiming.count({ where: { voiceId } })).toBe(0);
  });
});
