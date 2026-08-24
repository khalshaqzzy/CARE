import type {
  Area,
  ClassificationSource,
  RoutingCategory,
  Severity,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';

export type MemberVoiceDetail = {
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
  audience: 'MEMBER';
  reporter: { self: true };
  pic: { id?: string; label: string };
};
export type GeneralResponderVoiceDetail = Omit<MemberVoiceDetail, 'reporter' | 'audience'> & {
  audience: 'GENERAL_RESPONDER';
  reporter: { noReg: string; name: string; division: string; department: string };
};
export type PrivateResponderVoiceDetail = Omit<MemberVoiceDetail, 'reporter' | 'audience'> & {
  audience: 'PRIVATE_RESPONDER';
  anonymousReporter: { alias: string };
};
export type AdminPrivateVoiceDetail = Omit<PrivateResponderVoiceDetail, 'audience'> & {
  audience: 'ADMIN_PRIVATE';
};
export type ClassificationPreview = {
  source: ClassificationSource;
  category: RoutingCategory;
  severity: Severity;
  confidence: number;
  rationaleCode: string;
};
