-- Preserve the immutable classification category while introducing the
-- current operational category used by manager-to-manager routing.
ALTER TYPE "VoiceEventType" ADD VALUE IF NOT EXISTS 'HANDOVER_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HANDOVER_RECEIVED';

ALTER TABLE "Voice"
  ADD COLUMN "currentCategoryId" UUID,
  ADD COLUMN "currentCategoryKey" VARCHAR(80),
  ADD COLUMN "currentCategoryNameSnapshot" VARCHAR(160);

UPDATE "Voice"
SET
  "currentCategoryId" = "categoryId",
  "currentCategoryKey" = "categoryKey",
  "currentCategoryNameSnapshot" = "categoryNameSnapshot";

ALTER TABLE "Voice"
  ADD CONSTRAINT "Voice_currentCategoryId_fkey"
  FOREIGN KEY ("currentCategoryId") REFERENCES "GeneralVoiceCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Voice_area_currentCategoryKey_status_idx"
  ON "Voice"("area", "currentCategoryKey", "status");

CREATE TABLE "VoiceHandover" (
  "id" UUID NOT NULL,
  "voiceId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "fromCategoryId" UUID,
  "fromCategoryKey" VARCHAR(80),
  "fromCategoryNameSnapshot" VARCHAR(160),
  "toCategoryId" UUID NOT NULL,
  "toCategoryKey" VARCHAR(80) NOT NULL,
  "toCategoryNameSnapshot" VARCHAR(160) NOT NULL,
  "fromOrganizationUnitId" UUID,
  "fromDirectorateSnapshot" VARCHAR(200),
  "fromDivisionSnapshot" VARCHAR(200),
  "fromDepartmentSnapshot" VARCHAR(200),
  "toOrganizationUnitId" UUID NOT NULL,
  "toDirectorateSnapshot" VARCHAR(200) NOT NULL,
  "toDivisionSnapshot" VARCHAR(200) NOT NULL,
  "toDepartmentSnapshot" VARCHAR(200) NOT NULL,
  "fromRouteMappingId" UUID,
  "toRouteMappingId" UUID NOT NULL,
  "fromPicId" UUID NOT NULL,
  "toPicId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "routeMode" "GeneralVoiceCategoryRouteMode" NOT NULL,
  "isReporterDepartment" BOOLEAN NOT NULL DEFAULT false,
  "detail" VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceHandover_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VoiceHandover_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VoiceHandover_fromPicId_fkey" FOREIGN KEY ("fromPicId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VoiceHandover_toPicId_fkey" FOREIGN KEY ("toPicId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VoiceHandover_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VoiceHandover_voiceId_sequence_key" ON "VoiceHandover"("voiceId", "sequence");
CREATE INDEX "VoiceHandover_fromPicId_createdAt_id_idx" ON "VoiceHandover"("fromPicId", "createdAt", "id");
CREATE INDEX "VoiceHandover_toPicId_createdAt_id_idx" ON "VoiceHandover"("toPicId", "createdAt", "id");
CREATE INDEX "VoiceHandover_voiceId_createdAt_id_idx" ON "VoiceHandover"("voiceId", "createdAt", "id");
