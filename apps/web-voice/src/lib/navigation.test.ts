import { navigationForCapabilities, type NavigationItem } from './navigation';

const labels = (capabilities: string[], desktop = false): string[] => {
  const items: NavigationItem[] = navigationForCapabilities(capabilities, desktop);
  const result: string[] = [];
  for (const item of items) result.push(item.label);
  return result;
};

describe('capability-to-navigation mapping', () => {
  it('gives a Member the labelled four-item mobile dock and direct desktop destinations', () => {
    expect(labels(['MEMBER'])).toEqual(['Home', 'Buat Voice', 'Voice Saya', 'Pengaturan']);
    expect(labels(['MEMBER'], true)).toEqual([
      'Home',
      'Buat Voice',
      'Voice Saya',
      'Notifikasi',
      'Pengaturan',
    ]);
  });

  it.each(['MANAGER', 'SECTION_HEAD', 'GROUP_LEADER', 'DIVISION_LEADERSHIP', 'DIRECTOR'])(
    'adds Voice Member for %s',
    (capability) => {
      expect(labels(['MEMBER', capability])).toEqual([
        'Home',
        'Voice Member',
        'Buat Voice',
        'Voice Saya',
        'Pengaturan',
      ]);
    },
  );

  it('preserves the Union navigation contract', () => {
    expect(labels(['UNION_HEAD'])).toEqual([
      'Home',
      'Private',
      'General',
      'Notifikasi',
      'Pengaturan',
    ]);
  });
});
