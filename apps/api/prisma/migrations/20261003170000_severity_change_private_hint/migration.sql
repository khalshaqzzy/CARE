-- AlterEnum
ALTER TYPE "VoiceEventType" ADD VALUE 'SEVERITY_CHANGED';

-- AlterTable
ALTER TABLE "AIClassification" ADD COLUMN "privateSuggested" BOOLEAN NOT NULL DEFAULT false;
