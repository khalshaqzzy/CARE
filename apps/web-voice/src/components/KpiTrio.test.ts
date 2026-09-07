import { describe, expect, it } from 'vitest';
import { generalKpiItems } from './KpiTrio';
describe('General dashboard KPI', () => {
  it('reads critical from severity independently of status', () => {
    const items = generalKpiItems(
      [
        { label: 'OPEN', value: 18 },
        { label: 'IN_VERIFICATION', value: 7 },
        { label: 'IN_PROGRESS', value: 9 },
        { label: 'CLOSED', value: 8 },
      ],
      42,
      [{ label: 'CRITICAL', value: 3 }],
    );
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['Total', 42],
      ['Aktif', 34],
      ['Kritis', 3],
    ]);
  });
});
