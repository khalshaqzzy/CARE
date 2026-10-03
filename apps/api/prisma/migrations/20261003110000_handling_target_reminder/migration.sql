-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TARGET_REMINDER';

-- AlterTable
ALTER TABLE "VoiceHandlingTarget" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VoiceHandlingTarget_reminderSentAt_dueAt_idx" ON "VoiceHandlingTarget"("reminderSentAt", "dueAt");
