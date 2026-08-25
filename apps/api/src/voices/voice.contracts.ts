import type {
  AccountKind,
  AccountStatus,
  Area,
  ClassificationSource,
  LocationCompleteness,
  RoutingCategory,
  Severity,
  UnionSlot,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';

export type Capability =
  | 'MEMBER'
  | 'SECTION_HEAD'
  | 'MANAGER'
  | 'DIVISION_LEADERSHIP'
  | 'DIRECTOR'
  | 'UNION_HEAD'
  | 'UNION_OFFICER'
  | 'CARE_ADMIN';
export type ScopeDescriptor =
  | 'OWN'
  | 'GENERAL_GLOBAL'
  | 'GENERAL_OWN_DIVISION'
  | 'GENERAL_OWN_DEPARTMENT'
  | 'GENERAL_ALL'
  | 'EXPLICIT_WORK_ITEMS'
  | 'ASSIGNED'
  | 'PRIVATE_ALL'
  | 'PRIVATE_ASSIGNED'
  | 'ADMIN_OPERATIONAL';
export type SessionResponse = {
  account: {
    id: string;
    username: string;
    displayName: string;
    accountKind: AccountKind;
    status: AccountStatus;
  };
  workforceProfile: {
    structuralPosition: string | null;
    organizationSnapshotId: string;
    organizationUnitId: string;
  } | null;
  unionProfile: { slot: UnionSlot } | null;
  capabilities: Capability[];
  scopes: { overview: ScopeDescriptor[]; detail: ScopeDescriptor[]; action: ScopeDescriptor[] };
  sessionId: string;
  passwordChangeRequired: boolean;
};
export type ClassificationPreview = {
  source: ClassificationSource;
  category: RoutingCategory | null;
  severity: Severity;
  confidence: number;
  rationaleCode: string;
};
export type LocationReviewSnapshot = {
  id: string;
  completeness: LocationCompleteness;
  warning: string | null;
  questions: string[];
  contentHash: string;
  createdAt: Date;
};
export type VoiceDetailBase = {
  id: string;
  displayId: string;
  visibility: VoiceVisibility;
  area: Area;
  locationDetail: string;
  title: string;
  detail: string;
  category: RoutingCategory | null;
  severity: Severity;
  status: VoiceStatus;
  version: number;
};
export type ReporterSelfVoiceDetail = VoiceDetailBase & {
  audience: 'REPORTER_SELF';
  reporter: { self: true };
};
export type GeneralResponderVoiceDetail = VoiceDetailBase & {
  audience: 'GENERAL_RESPONDER';
  reporter: {
    noReg: string;
    name: string;
    directorate: string | null;
    division: string;
    department: string;
    section: string | null;
    position: string | null;
  };
};
export type LeadershipGeneralVoiceDetail = Omit<GeneralResponderVoiceDetail, 'audience'> & {
  audience: 'LEADERSHIP_GENERAL_READ_ONLY';
};
export type UnionAnonymousVoiceDetail = VoiceDetailBase & {
  audience: 'UNION_ANONYMOUS';
  anonymousReporter: { alias: string };
};
export type UnionIdentifiedVoiceDetail = VoiceDetailBase & {
  audience: 'UNION_IDENTIFIED';
  reporter: { noReg: string; name: string; division: string; department: string };
};
export type AdminPrivateVoiceDetail = VoiceDetailBase & {
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY';
  reporter: GeneralResponderVoiceDetail['reporter'];
};
export type DashboardAggregate = {
  total: number;
  status: Array<{ label: string; value: number }>;
  severity: Array<{ label: string; value: number }>;
  category: Array<{ label: string; value: number }>;
  trend: Array<{ label: string; value: number }>;
  division: Array<{ label: string; value: number }>;
  department: Array<{ label: string; value: number }>;
};
