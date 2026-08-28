import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
describe('representative 50,000-Voice queries', () => {
  afterAll(async () => prisma.$disconnect());
  it('meets dashboard and severity-first inbox targets for 50 concurrent users', async () => {
    const count = await prisma.voice.count({
      where: { displayId: { startsWith: 'CARE-209901-' } },
    });
    expect(count).toBeGreaterThanOrEqual(50_000);
    const manager = await prisma.userAccount.findUniqueOrThrow({
      where: { username: 'perf_00000' },
    });
    const members = await prisma.userAccount.findMany({
      where: { username: { startsWith: 'perf_', not: 'perf_00000' } },
      take: 40,
      orderBy: { username: 'asc' },
    });
    expect(members).toHaveLength(40);
    const durations: number[] = [];
    for (let round = 0; round < 5; round++) {
      const users = [
        ...members.map((member) => ({ kind: 'member' as const, id: member.id })),
        ...Array.from({ length: 10 }, () => ({ kind: 'manager' as const, id: manager.id })),
      ];
      await Promise.all(
        users.map(async (user) => {
          const started = performance.now();
          if (user.kind === 'member')
            await prisma.voice.findMany({
              where: { reporterId: user.id },
              take: 20,
              orderBy: [{ severity: 'desc' }, { submittedAt: 'desc' }, { id: 'desc' }],
            });
          else
            await Promise.all([
              prisma.voice.groupBy({
                by: ['status'],
                where: { routeOwnerId: user.id },
                _count: true,
              }),
              prisma.voice.findMany({
                where: { routeOwnerId: user.id, status: { not: 'CLOSED' } },
                take: 20,
                orderBy: [{ severity: 'desc' }, { submittedAt: 'desc' }, { id: 'desc' }],
              }),
            ]);
          durations.push(performance.now() - started);
        }),
      );
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    expect(p95).toBeLessThan(3_000);
    expect(durations).toHaveLength(250);
  });
});
