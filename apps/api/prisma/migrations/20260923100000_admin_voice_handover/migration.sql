ALTER TYPE "HandlerType" ADD VALUE IF NOT EXISTS 'ADMIN_TRIAGE';
ALTER TYPE "VoiceEventType" ADD VALUE IF NOT EXISTS 'ADMIN_HANDOVER_REQUESTED';
ALTER TYPE "VoiceEventType" ADD VALUE IF NOT EXISTS 'ADMIN_HANDOVER_ROUTED';
ALTER TYPE "VoiceEventType" ADD VALUE IF NOT EXISTS 'ADMIN_HANDOVER_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADMIN_HANDOVER_RETURNED';

CREATE TYPE "AdminHandoverStatus" AS ENUM ('PENDING', 'ROUTED', 'RETURNED');

CREATE TABLE "AdminHandover" (
  "id" UUID NOT NULL,
  "voiceId" UUID NOT NULL,
  "managerId" UUID NOT NULL,
  "adminId" UUID NOT NULL,
  "status" "AdminHandoverStatus" NOT NULL DEFAULT 'PENDING',
  "managerDetail" VARCHAR(4000) NOT NULL,
  "adminDetail" VARCHAR(4000),
  "sourceRouteMappingId" UUID,
  "sourceOrganizationUnitId" UUID,
  "destinationUnitId" UUID,
  "destinationRouteMappingId" UUID,
  "destinationPicId" UUID,
  "categoryId" UUID,
  "categoryKey" VARCHAR(80),
  "categoryNameSnapshot" VARCHAR(160),
  "resolvedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AdminHandover_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminHandover_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminHandover_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminHandover_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminHandover_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AdminHandover_status_createdAt_id_idx" ON "AdminHandover"("status", "createdAt", "id");
CREATE INDEX "AdminHandover_voiceId_createdAt_id_idx" ON "AdminHandover"("voiceId", "createdAt", "id");
CREATE INDEX "AdminHandover_managerId_createdAt_id_idx" ON "AdminHandover"("managerId", "createdAt", "id");
CREATE UNIQUE INDEX "AdminHandover_one_pending_per_voice" ON "AdminHandover"("voiceId") WHERE "status" = 'PENDING';
