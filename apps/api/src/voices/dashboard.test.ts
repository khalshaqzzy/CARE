import { describe, expect, it } from 'vitest';
import { dashboardQuerySchema, organizationKey, dashboardSql } from './dashboard';
describe('Dashboard query contract', () => {
  it('keeps slash-containing names and duplicate departments unambiguous', () => {
    expect(organizationKey(['A / B', 'C', 'Same'])).not.toBe(
      organizationKey(['A', 'B / C', 'Same']),
    );
  });
  it('rejects inverted offsets as timestamps and invalid enum values', () => {
    expect(
      dashboardQuerySchema.safeParse({
        from: '2026-08-02T01:00:00+07:00',
        to: '2026-08-01T17:00:00Z',
      }).success,
    ).toBe(false);
    expect(dashboardQuerySchema.safeParse({ area: 'secret' }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ basis: 'HANDLING', level: 'section' }).success).toBe(
      true,
    );
  });
  it('keeps organization text parameterized in aggregate SQL', () => {
    const payload = "x' OR TRUE --";
    const sql = dashboardSql({ handlingDivisionSnapshot: payload });
    expect(sql.text).not.toContain(payload);
    expect(sql.values).toContain(payload);
  });
});
