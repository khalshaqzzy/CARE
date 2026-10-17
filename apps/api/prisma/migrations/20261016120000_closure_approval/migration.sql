-- Medium and above: the PIC reports done and the levels above approve in turn.
ALTER TYPE "VoiceEventType" ADD VALUE 'CLOSURE_REPORTED';
ALTER TYPE "VoiceEventType" ADD VALUE 'CLOSURE_APPROVED';
ALTER TYPE "VoiceEventType" ADD VALUE 'CLOSURE_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE 'CLOSURE_APPROVAL';
ALTER TYPE "NotificationType" ADD VALUE 'CLOSURE_RETURNED';

CREATE TYPE "ClosureReportState" AS ENUM ('PENDING', 'CLOSED', 'RETURNED');
CREATE TYPE "ClosureApprovalState" AS ENUM ('WAITING', 'PENDING', 'APPROVED');

ALTER TABLE "Voice"
  ADD COLUMN "closureApproverIds" UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "closureReportedById" UUID;
CREATE INDEX "Voice_closureApproverIds_idx" ON "Voice" USING GIN ("closureApproverIds");

-- The PIC's finish time; earlier closures finished when they closed.
ALTER TABLE "ClosureCycle" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE TABLE "ClosureReport" (
  "id" UUID NOT NULL,
  "voiceId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "note" VARCHAR(4000) NOT NULL,
  "evidenceIds" UUID[] DEFAULT ARRAY[]::UUID[],
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" "ClosureReportState" NOT NULL DEFAULT 'PENDING',
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" UUID,
  "returnNote" VARCHAR(4000),
  "closureCycleId" UUID,
  CONSTRAINT "ClosureReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClosureReport_closureCycleId_key" ON "ClosureReport"("closureCycleId");
CREATE INDEX "ClosureReport_voiceId_state_idx" ON "ClosureReport"("voiceId", "state");
-- One report at a time waits for approval.
CREATE UNIQUE INDEX "ClosureReport_one_pending_key" ON "ClosureReport"("voiceId") WHERE "state" = 'PENDING';
ALTER TABLE "ClosureReport" ADD CONSTRAINT "ClosureReport_voiceId_fkey"
  FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ClosureApprovalStep" (
  "id" UUID NOT NULL,
  "reportId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "level" "TierLevel" NOT NULL,
  "approverIds" UUID[],
  "state" "ClosureApprovalState" NOT NULL DEFAULT 'WAITING',
  "startedAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3),
  "lateAt" TIMESTAMP(3),
  "decidedById" UUID,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "ClosureApprovalStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClosureApprovalStep_reportId_position_key" ON "ClosureApprovalStep"("reportId", "position");
CREATE INDEX "ClosureApprovalStep_state_remindedAt_idx" ON "ClosureApprovalStep"("state", "remindedAt");
ALTER TABLE "ClosureApprovalStep" ADD CONSTRAINT "ClosureApprovalStep_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "ClosureReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
