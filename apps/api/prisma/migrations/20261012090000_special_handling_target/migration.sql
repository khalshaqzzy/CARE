-- CreateEnum
CREATE TYPE "HandlingTargetKind" AS ENUM ('DAYS', 'SPECIAL');

-- AlterTable
ALTER TABLE "VoiceHandlingTarget"
  ADD COLUMN "kind" "HandlingTargetKind" NOT NULL DEFAULT 'DAYS',
  ADD COLUMN "specialReason" TEXT,
  ADD COLUMN "specialSetAt" TIMESTAMP(3),
  ADD COLUMN "specialSetById" UUID,
  ALTER COLUMN "days" DROP NOT NULL,
  ALTER COLUMN "dueAt" DROP NOT NULL;

-- A DAYS target always has a deadline; a SPECIAL one has a reason and none.
ALTER TABLE "VoiceHandlingTarget" ADD CONSTRAINT "VoiceHandlingTarget_kind_shape" CHECK (
  ("kind" = 'DAYS' AND "days" IS NOT NULL AND "dueAt" IS NOT NULL)
  OR ("kind" = 'SPECIAL' AND "days" IS NULL AND "dueAt" IS NULL AND "specialReason" IS NOT NULL)
);
