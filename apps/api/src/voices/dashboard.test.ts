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
  it('keeps enum predicates typed and values parameterized for planner statistics', () => {
    const sql = dashboardSql({
      visibility: 'GENERAL',
      status: 'CLOSED',
      severity: 'HIGH',
      area: 'SUNTER_1',
    });
    expect(sql.text).toContain('v."visibility" = $1::"VoiceVisibility"');
    expect(sql.text).toContain('v."status" = $2::"VoiceStatus"');
    expect(sql.text).toContain('v."severity" = $3::"Severity"');
    expect(sql.text).toContain('v."area" = $4::"Area"');
    expect(sql.values).toEqual(['GENERAL', 'CLOSED', 'HIGH', 'SUNTER_1']);
  });
});
