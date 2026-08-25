export const capabilities = [
  'MEMBER',
  'SECTION_HEAD',
  'MANAGER',
  'DIVISION_LEADERSHIP',
  'DIRECTOR',
  'UNION_HEAD',
  'UNION_OFFICER',
  'CARE_ADMIN',
] as const;

export type Capability = (typeof capabilities)[number];

export const divisionLeadershipPositions = new Set([
  'division head',
  'deputy division head',
  'deputy division head pjt.',
]);

export function normalizedPosition(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') ?? null;
}
