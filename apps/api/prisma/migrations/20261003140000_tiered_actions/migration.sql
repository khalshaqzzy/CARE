-- AlterEnum
ALTER TYPE "VoiceEventType" ADD VALUE 'ESCALATED';
ALTER TYPE "VoiceEventType" ADD VALUE 'REMINDED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ESCALATED';
ALTER TYPE "NotificationType" ADD VALUE 'REMINDER';

-- AlterTable
ALTER TABLE "Voice" ADD COLUMN "sectionHasGroupLeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tierLowerHolderIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN "tierObserverIds" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "VoiceReminder" (
    "id" UUID NOT NULL,
    "voiceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voice_tierObserverIds_idx" ON "Voice" USING GIN ("tierObserverIds");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceReminder_voiceId_actorId_targetId_dayKey_key" ON "VoiceReminder"("voiceId", "actorId", "targetId", "dayKey");

-- AddForeignKey
ALTER TABLE "VoiceReminder" ADD CONSTRAINT "VoiceReminder_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
