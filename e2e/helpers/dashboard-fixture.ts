import type { components } from '../../packages/contracts/src/generated.js';
type Session = components['schemas']['SessionResponse'];
type Metadata = components['schemas']['DashboardMetadata'];
type View = components['schemas']['DashboardView'];
type Legacy = components['schemas']['DashboardAggregate'];
export const orgKey = (...p: string[]) => Buffer.from(JSON.stringify(p)).toString('base64url');
export function dashboardFixture(
  session: Session,
  url: URL,
  legacy?: unknown,
): { metadata: Metadata; view: View } {
  const caps = session.capabilities;
  const isPrivate =
    url.pathname.endsWith('/private') || url.searchParams.get('visibility') === 'PRIVATE';
  const union = caps.some((c) => c.startsWith('UNION_'));
  const global = union || caps.includes('DIRECTOR');
  const leader = caps.includes('DIVISION_LEADERSHIP');
  const level = (url.searchParams.get('level') ??
    (isPrivate
      ? 'section'
      : global
        ? 'division'
        : leader
          ? 'department'
          : 'section')) as Metadata['level'];
  const directorate = 'Production';
  const division = 'Production Division';
  const department = 'Production Control';
  const option = (label: string, path: string[]) => ({
    label,
    id: orgKey(...path),
    parentId: path.length > 1 ? orgKey(...path.slice(0, -1)) : null,
  });
  const sectionOnly = !global && !leader && !caps.includes('MANAGER');
  const scopeMode = (url.searchParams.get('scopeMode') ??
    (isPrivate
      ? 'OWN'
      : global || (leader && level === 'division')
        ? 'GLOBAL'
        : !leader && !sectionOnly && level === 'department'
          ? 'PARENT'
          : 'OWN')) as Metadata['scopeMode'];
  const explicit = Object.fromEntries(
    ['directorate', 'division', 'department', 'section']
      .filter((l) => url.searchParams.has(l))
      .map((l) => [l, url.searchParams.get(l)!]),
  );
  for (const id of Object.values(explicit)) {
    const parts = JSON.parse(Buffer.from(id, 'base64url').toString()) as string[];
    parts.forEach(
      (_, i) =>
        (explicit[['directorate', 'division', 'department', 'section'][i]!] = orgKey(
          ...parts.slice(0, i + 1),
        )),
    );
  }
  const defaultSelected =
    !global && !isPrivate && scopeMode !== 'GLOBAL'
      ? {
          directorate: orgKey(directorate),
          division: orgKey(directorate, division),
          ...(!leader && (scopeMode === 'OWN' || sectionOnly)
            ? { department: orgKey(directorate, division, department) }
            : {}),
          ...(sectionOnly && scopeMode === 'OWN'
            ? { section: orgKey(directorate, division, department, 'Assembly 1') }
            : {}),
        }
      : {};
  const metadata: Metadata = {
    scopeMode,
    allowedScopeModes: isPrivate
      ? ['OWN']
      : global
        ? ['GLOBAL']
        : leader
          ? ['OWN', 'GLOBAL']
          : ['OWN', 'PARENT'],
    basis: (url.searchParams.get('basis') ?? 'HANDLING') as Metadata['basis'],
    visibility: isPrivate ? 'PRIVATE' : 'GENERAL',
    level,
    allowedLevels:
      isPrivate || (caps.includes('SECTION_HEAD') && !caps.includes('MANAGER'))
        ? ['section']
        : global
          ? ['division', 'department', 'section']
          : leader
            ? ['department', 'division', 'section']
            : ['section', 'department'],
    organization: isPrivate
      ? { directorate: [], division: [], department: [], section: [] }
      : {
          directorate: [option(directorate, [directorate])],
          division: [option(division, [directorate, division])],
          department: [
            option(department, [directorate, division, department]),
            ...(global || leader
              ? [
                  option('Manufacturing Engineering', [
                    directorate,
                    division,
                    'Manufacturing Engineering',
                  ]),
                ]
              : []),
          ],
          section: (sectionOnly
            ? ['Assembly 1']
            : ['Assembly 1', 'Welding', 'Painting', 'Logistics', 'Quality']
          ).map((s) => option(s, [directorate, division, department, s])),
        },
    selected: { ...defaultSelected, ...explicit },
    handlers: caps.includes('UNION_OFFICER')
      ? [{ id: session.account.id, label: 'Union 1' }]
      : [
          { id: 'union-head', label: 'Union Head' },
          { id: 'union-1', label: 'Union 1' },
          { id: 'union-2', label: 'Union 2' },
        ],
    categories: isPrivate
      ? []
      : [
          ['SAFETY', 'Safety'],
          ['ENVIRONMENT', 'Environment'],
          ['FACILITY', 'Fasilitas Umum'],
          ['FACILITY_REPAIR', 'Facility Repair'],
          ['WORK_DIFFICULTY', 'Kesulitan Kerja'],
          ['WELFARE', 'Kesejahteraan'],
        ].map(([id, label]) => ({ id: id!, label: label! })),
    scopeLabel: '',
  };
  metadata.scopeLabel = isPrivate
    ? caps.includes('UNION_HEAD')
      ? 'Seluruh Private Voice'
      : 'Penugasan Anda'
    : Object.values(metadata.selected).length
      ? (
          JSON.parse(
            Buffer.from(Object.values(metadata.selected).at(-1)!, 'base64url').toString(),
          ) as string[]
        ).at(-1)!
      : 'Seluruh organisasi';
  const old = legacy as Legacy | undefined;
  const total =
    old?.total ??
    (scopeMode === 'GLOBAL'
      ? 21
      : scopeMode === 'PARENT' && !sectionOnly
        ? 17
        : sectionOnly && scopeMode === 'OWN'
          ? 8
          : 12);
  const view: View = {
    ...metadata,
    total,
    status: old?.status ?? [
      { label: 'OPEN', value: total - 6 },
      { label: 'IN_VERIFICATION', value: 0 },
      { label: 'IN_PROGRESS', value: 3 },
      { label: 'CLOSED', value: 3 },
    ],
    severity: old?.severity ?? [
      { label: 'CRITICAL', value: 3 },
      { label: 'HIGH', value: 3 },
      { label: 'MEDIUM', value: total - 8 },
      { label: 'LOW', value: 2 },
    ],
    category:
      old?.category ??
      metadata.categories.map((c, i) => ({
        key: c.id,
        name: c.label,
        label: c.label,
        value: i === 0 ? total - 5 : i === 1 ? 3 : i === 2 ? 2 : 0,
      })),
    trend: Array.from({ length: 30 }, (_, i) => ({
      label: `2026-08-${String(i + 1).padStart(2, '0')}`,
      value: i === 25 ? total - 4 : i === 26 ? 4 : 0,
    })),
    organization: isPrivate
      ? [{ id: 'union-1', label: 'Union 1', value: total }]
      : level === 'section'
        ? [{ id: 'section-unassigned', label: 'Belum ditugaskan ke section', value: total }]
        : level === 'department'
          ? [
              {
                id: orgKey(directorate, division, department),
                label: department,
                value: scopeMode === 'PARENT' ? 12 : total,
              },
              ...(scopeMode === 'PARENT'
                ? [
                    {
                      id: orgKey(directorate, division, 'Manufacturing Engineering'),
                      label: 'Manufacturing Engineering',
                      value: total - 12,
                    },
                  ]
                : []),
            ]
          : [
              { id: orgKey(directorate, division), label: division, value: 17 },
              { id: orgKey('Other', 'Other Division'), label: 'Other Division', value: total - 17 },
            ],
    area: old?.area ?? [{ label: 'SUNTER_1', value: total }],
    previousTotal: old?.previousTotal ?? 39,
    trendGrain: 'day',
    ...(isPrivate && caps.includes('UNION_HEAD')
      ? { pendingAssignment: old?.pendingAssignment ?? 3 }
      : {}),
    handlingUnresolved: 0,
    filters: Object.fromEntries(url.searchParams),
    generatedAt: '2026-08-30T03:00:00Z',
  };
  if (sectionOnly && !isPrivate) {
    view.organization = [
      {
        id: orgKey(directorate, division, department, 'Assembly 1'),
        label: 'Assembly 1',
        value: scopeMode === 'OWN' ? total : 8,
      },
      ...(scopeMode === 'PARENT'
        ? [
            {
              id: orgKey(directorate, division, department, 'Welding'),
              label: 'Welding',
              value: total - 8,
            },
          ]
        : []),
    ];
  }
  return { metadata, view };
}
