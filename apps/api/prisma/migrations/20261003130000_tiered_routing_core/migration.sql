-- AlterEnum
ALTER TYPE "HandlerType" ADD VALUE 'GROUP_LEADER';

-- CreateEnum
CREATE TYPE "TierLevel" AS ENUM ('GROUP_LEADER', 'SECTION_HEAD', 'MANAGER', 'DIVISION');

-- AlterTable
ALTER TABLE "GeneralVoiceCategory" ADD COLUMN "tiered" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Voice" ADD COLUMN "outsideReporter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tierHolderIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN "tierLevel" "TierLevel",
ADD COLUMN "tierPath" "TierLevel"[] DEFAULT ARRAY[]::"TierLevel"[];

-- CreateIndex
CREATE INDEX "Voice_tierHolderIds_idx" ON "Voice" USING GIN ("tierHolderIds");

-- Seeded tiered categories (ADR-0059). Existing Voices keep the classic route.
UPDATE "GeneralVoiceCategory" SET "tiered" = true WHERE "key" IN ('WORK_DIFFICULTY', 'WELFARE');
