-- AlterTable
ALTER TABLE "Voice" ADD COLUMN "tierParticipantIds" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateIndex
CREATE INDEX "Voice_tierParticipantIds_idx" ON "Voice" USING GIN ("tierParticipantIds");
