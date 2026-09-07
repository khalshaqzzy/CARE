import { describe, expect, it } from 'vitest';
import { filterHandoverOptions } from '../components/HandoverDestinationCard';
import type { HandoverOption } from '../workforce-api';

const option: HandoverOption = {
  category: { id: 'category', key: 'SAFETY', name: 'Keselamatan Kerja' },
  routeMode: 'RELATED_REPORTER_DEPARTMENT',
  department: {
    id: 'department',
    directorate: 'Manufacturing',
    division: 'Production',
    department: 'Production Control',
  },
  pic: { id: 'pic', displayName: 'Dedi Slamet', type: 'DEPARTMENT_HEAD' },
  isReporterDepartment: true,
  available: true,
  disabledReason: null,
};

describe('filterHandoverOptions', () => {
  it.each(['safety', 'keselamatan', 'production control', 'manufacturing', 'production', 'dedi'])(
    'matches category, organization context, or PIC for %s',
    (search) => expect(filterHandoverOptions([option], search)).toEqual([option]),
  );

  it('keeps disabled route-gap cards searchable and returns empty safely', () => {
    const gap = { ...option, available: false, pic: null, disabledReason: 'PIC belum tersedia' };
    expect(filterHandoverOptions([gap], 'keselamatan')).toEqual([gap]);
    expect(filterHandoverOptions([gap], 'legal')).toEqual([]);
  });
});
