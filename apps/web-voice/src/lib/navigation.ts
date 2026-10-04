export type NavigationItem = {
  id: string;
  label: string;
};

const workforceCore: NavigationItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'create', label: 'Buat Voice' },
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
      { id: 'home', label: 'Home' },
      { id: 'private', label: 'Private' },
      { id: 'general', label: 'General' },
      { id: 'notifications', label: 'Notifikasi' },
      { id: 'account', label: 'Pengaturan' },
    ];

  const monitorsMembers = capabilities.some((capability) =>
    ['MANAGER', 'SECTION_HEAD', 'GROUP_LEADER', 'DIVISION_LEADERSHIP', 'DIRECTOR'].includes(
      capability,
    ),
  );
  const items = [
    workforceCore[0]!,
    ...(monitorsMembers ? [{ id: 'work-items', label: 'Voice Member' }] : []),
    workforceCore[1]!,
    workforceCore[2]!,
  ];
  // Every tab carries its label; notifications live behind the Home bell on mobile.
  return desktop
    ? [
        ...items,
        { id: 'notifications', label: 'Notifikasi' },
        { id: 'account', label: 'Pengaturan' },
      ]
    : [...items, { id: 'account', label: 'Pengaturan' }];
}
