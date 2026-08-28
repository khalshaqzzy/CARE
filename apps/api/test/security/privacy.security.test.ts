import { describe, expect, it } from 'vitest';
import { VoicesService } from '../../src/voices/voices.service';

const voice = {
  id: 'voice',
  displayId: 'CARE-202608-000001',
  reporterId: 'reporter-secret',
  visibility: 'PRIVATE',
  area: 'KARAWANG_1',
  locationDetail: 'line',
  title: 'private',
  detail: 'detail',
  category: null,
  severity: 'HIGH',
  status: 'OPEN',
  version: 1,
  routeOwner: null,
  currentHandler: null,
  attachments: [],
  locationReview: null,
  anonymousAlias: 'Anonymous-X',
  reporterNoRegSnapshot: 'SECRET',
  reporterNameSnapshot: 'Secret Name',
  reporterDirectorateSnapshot: 'Secret Directorate',
  reporterDivisionSnapshot: 'Secret Division',
  reporterDepartmentSnapshot: 'Secret Department',
  reporterSectionSnapshot: 'Secret Section',
  reporterPositionSnapshot: 'Member',
};
const actor = (capabilities: string[]) => ({ accountId: 'union', capabilities });

describe('Private Voice response boundary', () => {
  it('omits identity fields from anonymous Union DTOs', () => {
    const service = Object.create(VoicesService.prototype) as any;
    const response = service.serialize(actor(['UNION_HEAD']), {
      ...voice,
      showReporterIdentity: false,
    });
    expect(response.audience).toBe('UNION_ANONYMOUS');
    const json = JSON.stringify(response);
    expect(json).toContain('Anonymous-X');
    for (const value of [
      'reporter-secret',
      'SECRET',
      'Secret Name',
      'Secret Division',
      'Secret Department',
    ])
      expect(json).not.toContain(value);
  });
  it('reveals only consented fields to Union and full snapshots to Admin', () => {
    const service = Object.create(VoicesService.prototype) as any;
    const identified = service.serialize(actor(['UNION_HEAD']), {
      ...voice,
      showReporterIdentity: true,
    });
    expect(identified.reporter).toEqual({
      noReg: 'SECRET',
      name: 'Secret Name',
      division: 'Secret Division',
      department: 'Secret Department',
    });
    const admin = service.serialize(actor(['CARE_ADMIN']), {
      ...voice,
      showReporterIdentity: false,
    });
    expect(admin.audience).toBe('ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY');
    expect(admin.reporter.section).toBe('Secret Section');
  });
});
