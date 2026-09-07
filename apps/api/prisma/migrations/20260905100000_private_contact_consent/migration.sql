ALTER TABLE "VoiceDraft" ADD COLUMN "privateContactConsent" BOOLEAN;
ALTER TABLE "Voice" ADD COLUMN "privateContactConsent" BOOLEAN,
  ADD COLUMN "privateContactConsentRecordedAt" TIMESTAMP(3),
  ADD COLUMN "privateContactConsentVersion" VARCHAR(16);
