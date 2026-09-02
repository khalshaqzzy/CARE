import { describe, expect, it } from 'vitest';
import { VoicesService } from '../../src/voices/voices.service';

const record = {
  id: 'handover-id',
  sequence: 1,
  fromCategoryId: 'category-a',
  fromCategoryKey: 'SAFETY',
  fromCategoryNameSnapshot: 'Safety',
  toCategoryId: 'category-b',
  toCategoryKey: 'FACILITY',
  toCategoryNameSnapshot: 'Fasilitas',
  fromOrganizationUnitId: 'unit-a',
  fromDirectorateSnapshot: 'Manufacturing',
  fromDivisionSnapshot: 'Plant',
  fromDepartmentSnapshot: 'SHE',
  toOrganizationUnitId: 'unit-b',
  toDirectorateSnapshot: 'Manufacturing',
  toDivisionSnapshot: 'Plant',
  toDepartmentSnapshot: 'GA',
  fromPicId: 'manager-a',
  toPicId: 'manager-b',
  fromPic: { id: 'manager-a', displayName: 'Manager A' },
  toPic: { id: 'manager-b', displayName: 'Manager B' },
  routeMode: 'FIXED_DEPARTMENT',
  isReporterDepartment: false,
  detail: 'PAIRWISE-SECRET-NOTE',
  createdAt: new Date('2026-09-02T00:00:00.000Z'),
};

describe('Voice handover note boundary', () => {
  const service = Object.create(VoicesService.prototype) as {
    handoverShape: (actor: { accountId: string }, value: typeof record) => unknown;
  };

  it.each(['manager-a', 'manager-b'])('returns the note to adjacent PIC %s', (accountId) => {
    expect(service.handoverShape({ accountId }, record)).toMatchObject({
      detail: 'PAIRWISE-SECRET-NOTE',
    });
  });

  it.each(['reporter', 'leadership', 'care-admin', 'unrelated-manager'])(
    'redacts the note from %s',
    (accountId) => {
      const shaped = service.handoverShape({ accountId }, record);
      expect(JSON.stringify(shaped)).not.toContain('PAIRWISE-SECRET-NOTE');
      expect(shaped).not.toHaveProperty('detail');
    },
  );
});
