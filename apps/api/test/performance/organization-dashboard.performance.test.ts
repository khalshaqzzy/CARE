import { PrismaClient } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { PolicyService } from '../../src/auth/policy.service';
import { OrganizationDashboard } from '../../src/voices/dashboard';
const db = new PrismaClient();
const policy = new PolicyService(db as never);
const dashboard = new OrganizationDashboard(db as never);
afterAll(() => db.$disconnect());
it('serves the full organization aggregate at p95 under three seconds on 50k voices', async () => {
  expect(await db.voice.count()).toBeGreaterThanOrEqual(50000);
  const account = await db.userAccount.findUniqueOrThrow({ where: { username: 'perf_00000' } });
  const actor = await policy.resolvePrincipal(account, {
    id: crypto.randomUUID(),
    passwordRestricted: false,
  });
  const durations: number[] = [];
  for (let round = 0; round < 3; round++)
    await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const start = performance.now();
        const data = await dashboard.aggregate(
          i % 3 === 0
            ? {
                ...actor,
                capabilities: ['MEMBER', i % 6 === 0 ? 'DIRECTOR' : 'DIVISION_LEADERSHIP'],
              }
            : actor,
          {
            basis: i % 2 ? 'HANDLING' : 'REPORTER',
            level: i % 3 === 0 ? 'division' : 'department',
          },
        );
        expect(data.total).toBeGreaterThan(0);
        durations.push(performance.now() - start);
      }),
    );
  const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)]!;
  process.stdout.write(
    `Organization dashboard p95: ${Math.round(p95)}ms (150 requests / 50 concurrent)\n`,
  );
  expect(p95).toBeLessThan(3000);
}, 120000);
