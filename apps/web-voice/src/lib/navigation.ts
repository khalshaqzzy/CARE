export type NavigationItem = {
  id: string;
  label: string;
};

const workforceCore: NavigationItem[] = [
  { id: 'home', label: 'Beranda' },
  { id: 'create', label: 'Buat' },
  { id: 'history', label: 'Voice Saya' },
];

export function navigationForCapabilities(
  capabilities: string[],
  desktop: boolean,
): NavigationItem[] {
  const isUnion = capabilities.some((capability) =>
    ['UNION_HEAD', 'UNION_OFFICER'].includes(capability),
  );
  if (isUnion)
    return [
      { id: 'home', label: 'Beranda' },
      { id: 'private', label: 'Private' },
      { id: 'general', label: 'General' },
      { id: 'notifications', label: 'Notifikasi' },
      { id: 'account', label: 'Akun' },
    ];

  const monitorsMembers = capabilities.some((capability) =>
    ['MANAGER', 'SECTION_HEAD', 'DIVISION_LEADERSHIP', 'DIRECTOR'].includes(capability),
  );
  const items = [
    workforceCore[0]!,
    ...(monitorsMembers ? [{ id: 'work-items', label: 'Voice Member' }] : []),
    workforceCore[1]!,
    workforceCore[2]!,
  ];
  return desktop
    ? [...items, { id: 'notifications', label: 'Notifikasi' }, { id: 'account', label: 'Akun' }]
    : [...items, { id: 'more', label: 'Lainnya' }];
}
