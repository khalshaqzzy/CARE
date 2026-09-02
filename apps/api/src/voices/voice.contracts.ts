import type {
  AccountKind,
  AccountStatus,
  Area,
  ClassificationSource,
  LocationCompleteness,
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
    organizationSnapshotId: string | null;
    organizationUnitId: string | null;
  } | null;
  unionProfile: { slot: UnionSlot } | null;
  capabilities: Capability[];
  scopes: { overview: ScopeDescriptor[]; detail: ScopeDescriptor[]; action: ScopeDescriptor[] };
  sessionId: string;
  passwordChangeRequired: boolean;
};
export type ClassificationPreview = {
  source: ClassificationSource;
  category: string | null;
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
  category: string | null;
  severity: Severity;
  status: VoiceStatus;
  version: number;
  submittedAt: Date;
  updatedAt: Date;
  classificationSource: ClassificationSource | null;
  routeOwner: { id: string; displayName: string };
  currentHandler: { id: string; displayName: string } | null;
  attachments: unknown[];
  locationReview: LocationReviewSnapshot | null;
  closureCycles: Array<{
    id: string;
    cycleNumber: number;
    note: string;
    closedAt: Date;
    reopenedAt: Date | null;
    reviewState: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    reviewDeadline: Date | null;
    reviewResolvedAt: Date | null;
    actor: { id: string; displayName: string };
    evidence: unknown[];
    rating: { score: number; feedback: string | null; reopen: boolean; createdAt: Date } | null;
  }>;
  availableActions: string[];
  conversationState: 'UNAVAILABLE' | 'ACTIVE' | 'READ_ONLY';
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
  category: Array<{ key: string; name: string; label: string; value: number }>;
  trend: Array<{ label: string; value: number }>;
  division: Array<{ label: string; value: number }>;
  department: Array<{ label: string; value: number }>;
};
export type RouteReadiness = {
  ready: boolean;
  reason?: string;
  targetLabel?: string;
  remediationCode?: string;
};
export type DraftListItem = {
  id: string;
  visibility: VoiceVisibility;
  area: Area;
  locationDetail: string;
  title: string;
  detail: string;
  showReporterIdentity: boolean | null;
  version: number;
  expiresAt: Date;
  updatedAt: Date;
};
export type DraftListResponse = {
  items: DraftListItem[];
  nextCursor: string | null;
};
export type MemberDashboard = {
  total: number;
  counts: Record<VoiceStatus, number>;
  closedPendingReview: number;
  recent: Array<{
    id: string;
    displayId: string;
    visibility: VoiceVisibility;
    area: Area;
    title: string;
    category: string | null;
    severity: Severity;
    status: VoiceStatus;
    closureReviewState: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
    closureReviewDeadline: Date | null;
    updatedAt: Date;
  }>;
  draft: DraftListItem | null;
  generatedAt: string;
};
