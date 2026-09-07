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
  const defaultSelected =
    !global && !isPrivate
      ? {
          directorate: orgKey(directorate),
          ...(level !== 'division' ? { division: orgKey(directorate, division) } : {}),
          ...(level === 'section' ? { department: orgKey(directorate, division, department) } : {}),
        }
      : {};
  const metadata: Metadata = {
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
            option('Manufacturing Engineering', [
              directorate,
              division,
              'Manufacturing Engineering',
            ]),
          ],
          section: ['Assembly 1', 'Welding', 'Painting', 'Logistics', 'Quality'].map((s) =>
            option(s, [directorate, division, department, s]),
          ),
        },
    selected: {
      ...defaultSelected,
      ...Object.fromEntries(
        ['directorate', 'division', 'department', 'section']
          .filter((l) => url.searchParams.has(l))
          .map((l) => [l, url.searchParams.get(l)!]),
      ),
    },
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
    scopeLabel: isPrivate
      ? caps.includes('UNION_HEAD')
        ? 'Seluruh Private Voice'
        : 'Penugasan Anda'
      : level === 'division'
        ? 'Seluruh organisasi'
        : level === 'department'
          ? division
          : department,
  };
  const old = legacy as Legacy | undefined;
  const total = old?.total ?? 42;
  const view: View = {
    ...metadata,
    total,
    status: old?.status ?? [
      { label: 'OPEN', value: 18 },
      { label: 'IN_VERIFICATION', value: 7 },
      { label: 'IN_PROGRESS', value: 9 },
      { label: 'CLOSED', value: 8 },
    ],
    severity: old?.severity ?? [
      { label: 'CRITICAL', value: 3 },
      { label: 'HIGH', value: 11 },
      { label: 'MEDIUM', value: 18 },
      { label: 'LOW', value: 10 },
    ],
    category:
      old?.category ??
      metadata.categories.map((c, i) => ({
        key: c.id,
        name: c.label,
        label: c.label,
        value: [12, 7, 8, 5, 6, 4][i]!,
      })),
    trend: Array.from({ length: 30 }, (_, i) => ({
      label: `2026-08-${String(i + 1).padStart(2, '0')}`,
      value: i < 6 ? 0 : i < 12 ? 1 : 2,
    })),
    organization: isPrivate
      ? [{ id: 'union-1', label: 'Union 1', value: total }]
      : (level === 'section'
          ? ['Assembly 1', 'Welding', 'Painting', 'Logistics', 'Quality']
          : level === 'department'
            ? ['Production Control', 'Manufacturing Engineering', 'Quality Assurance']
            : ['Production Division', 'Corporate Planning', 'Quality Division']
        ).map((label, i) => ({ id: `bucket-${i}`, label, value: [12, 9, 8, 7, 6][i]! })),
    area: old?.area ?? [],
    previousTotal: old?.previousTotal ?? 39,
    trendGrain: 'day',
    ...(isPrivate && caps.includes('UNION_HEAD')
      ? { pendingAssignment: old?.pendingAssignment ?? 3 }
      : {}),
    protected: false,
    suppressedDimensions: [],
    suppression: { enabled: !global && !isPrivate, threshold: 5 },
    handlingUnresolved: 0,
    filters: Object.fromEntries(url.searchParams),
    generatedAt: '2026-08-30T03:00:00Z',
  };
  return { metadata, view };
}
