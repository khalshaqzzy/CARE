-- CreateEnum
CREATE TYPE "TierDueKind" AS ENUM ('RESPOND', 'PROCESS');

-- AlterTable
ALTER TABLE "Voice" ADD COLUMN "tierDueAt" TIMESTAMP(3),
ADD COLUMN "tierDueKind" "TierDueKind",
ADD COLUMN "tierHolderResponded" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Voice_tierDueAt_status_idx" ON "Voice"("tierDueAt", "status");
