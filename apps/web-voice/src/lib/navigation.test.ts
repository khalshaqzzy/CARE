import { navigationForCapabilities, type NavigationItem } from './navigation';

const labels = (capabilities: string[], desktop = false): string[] => {
  const items: NavigationItem[] = navigationForCapabilities(capabilities, desktop);
  const result: string[] = [];
  for (const item of items) result.push(item.label);
  return result;
};

describe('capability-to-navigation mapping', () => {
  it('gives a Member the four-item mobile dock and direct desktop destinations', () => {
    expect(labels(['MEMBER'])).toEqual(['Beranda', 'Buat', 'Voice Saya', 'Lainnya']);
    expect(labels(['MEMBER'], true)).toEqual([
      'Beranda',
      'Buat',
      'Voice Saya',
      'Notifikasi',
      'Akun',
    ]);
  });

  it.each(['MANAGER', 'SECTION_HEAD', 'DIVISION_LEADERSHIP', 'DIRECTOR'])(
    'adds Voice Member for %s',
    (capability) => {
      expect(labels(['MEMBER', capability])).toEqual([
        'Beranda',
        'Voice Member',
        'Buat',
        'Voice Saya',
        'Lainnya',
      ]);
    },
  );

  it('preserves the Union navigation contract', () => {
    expect(labels(['UNION_HEAD'])).toEqual(['Beranda', 'Private', 'General', 'Notifikasi', 'Akun']);
  });
});
