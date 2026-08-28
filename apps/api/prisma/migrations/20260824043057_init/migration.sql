-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CARE_ADMIN', 'MEMBER', 'MANAGER', 'SECTION_HEAD', 'UNION');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('KARAWANG_1', 'KARAWANG_2', 'KARAWANG_3', 'SUNTER_1', 'SUNTER_2');

-- CreateEnum
CREATE TYPE "VoiceVisibility" AS ENUM ('PRIVATE', 'GENERAL');

-- CreateEnum
CREATE TYPE "RoutingCategory" AS ENUM ('SAFETY', 'FACILITY', 'WORK_DIFFICULTY');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "VoiceStatus" AS ENUM ('OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "HandlerType" AS ENUM ('MANAGER', 'SECTION_HEAD', 'UNION');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('AI', 'MANUAL_FALLBACK');

-- CreateEnum
CREATE TYPE "AttachmentPurpose" AS ENUM ('VOICE', 'CHAT', 'CLOSURE_EVIDENCE');

-- CreateEnum
CREATE TYPE "AttachmentState" AS ENUM ('STAGED', 'PROCESSED', 'REFERENCED', 'READY', 'ORPHANED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('EMPLOYEE', 'MANAGER', 'UNION');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEWED', 'CONFIRMED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VoiceEventType" AS ENUM ('SUBMITTED', 'ASKED_REPORTER', 'MESSAGE_SENT', 'ASSIGNED', 'REASSIGNED', 'PROCEEDED', 'CLOSED', 'RATED', 'REOPENED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VOICE_SUBMITTED', 'ASSIGNED', 'MESSAGE', 'STATUS_CHANGED', 'CLOSED', 'RATED', 'REOPENED', 'SECURITY');

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "noReg" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "division" VARCHAR(200) NOT NULL,
    "department" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" UUID NOT NULL,
    "employeeId" UUID,
    "username" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerProfile" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "area" "Area" NOT NULL,
    "department" VARCHAR(200) NOT NULL,
    "isSafety" BOOLEAN NOT NULL DEFAULT false,
    "isFacility" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionHeadRelation" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SectionHeadRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "csrfSecret" CHAR(64) NOT NULL,
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(300),
    "passwordRestricted" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "checksum" CHAR(64) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestThrottle" (
    "keyHash" CHAR(64) NOT NULL,
    "bucket" VARCHAR(40) NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestThrottle_pkey" PRIMARY KEY ("keyHash")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceDraft" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "area" "Area" NOT NULL,
    "locationDetail" VARCHAR(200) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "detail" VARCHAR(5000) NOT NULL,
    "visibility" "VoiceVisibility" NOT NULL,
    "reporterDepartment" VARCHAR(200) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voice" (
    "id" UUID NOT NULL,
    "displayId" VARCHAR(30) NOT NULL,
    "reporterId" UUID NOT NULL,
    "visibility" "VoiceVisibility" NOT NULL,
    "area" "Area" NOT NULL,
    "reporterDepartment" VARCHAR(200) NOT NULL,
    "locationDetail" VARCHAR(200) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "detail" VARCHAR(5000) NOT NULL,
    "category" "RoutingCategory",
    "severity" "Severity" NOT NULL,
    "status" "VoiceStatus" NOT NULL DEFAULT 'OPEN',
    "routeOwnerId" UUID NOT NULL,
    "currentHandlerId" UUID,
    "handlerType" "HandlerType" NOT NULL,
    "anonymousAlias" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanVoiceSequence" (
    "period" CHAR(6) NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "HumanVoiceSequence_pkey" PRIMARY KEY ("period")
);

-- CreateTable
CREATE TABLE "AIClassification" (
    "id" UUID NOT NULL,
    "draftId" UUID,
    "voiceId" UUID,
    "model" VARCHAR(100) NOT NULL,
    "location" VARCHAR(40) NOT NULL,
    "promptVersion" VARCHAR(40) NOT NULL,
    "source" "ClassificationSource" NOT NULL,
    "category" "RoutingCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rationaleCode" VARCHAR(80) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "responseId" VARCHAR(200),
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "fallbackCode" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "draftId" UUID,
    "voiceId" UUID,
    "messageId" UUID,
    "closureId" UUID,
    "uploaderId" UUID NOT NULL,
    "purpose" "AttachmentPurpose" NOT NULL,
    "state" "AttachmentState" NOT NULL DEFAULT 'STAGED',
    "storageKey" TEXT NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceAssignment" (
    "id" UUID NOT NULL,
    "voiceId" UUID NOT NULL,
    "handlerId" UUID NOT NULL,
    "handlerType" "HandlerType" NOT NULL,
    "actorId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceEvent" (
    "id" UUID NOT NULL,
    "voiceId" UUID NOT NULL,
    "type" "VoiceEventType" NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "voiceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "senderRole" "Role" NOT NULL,
    "text" VARCHAR(4000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosureCycle" (
    "id" UUID NOT NULL,
    "voiceId" UUID NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "note" VARCHAR(4000) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedAt" TIMESTAMP(3),

    CONSTRAINT "ClosureCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" UUID NOT NULL,
    "closureCycleId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" VARCHAR(2000),
    "reopen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "voiceId" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "deepLink" VARCHAR(300),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "installationId" VARCHAR(100) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "endpointHash" CHAR(64) NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "environment" VARCHAR(30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" VARCHAR(200),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "action" VARCHAR(100) NOT NULL,
    "result" VARCHAR(40) NOT NULL,
    "resourceType" VARCHAR(80) NOT NULL,
    "resourceId" VARCHAR(100),
    "summary" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "correlationId" VARCHAR(100) NOT NULL,
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(300),
    "sessionRef" CHAR(64),
    "releaseSha" VARCHAR(80) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_noReg_key" ON "Employee"("noReg");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_employeeId_key" ON "UserAccount"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_username_key" ON "UserAccount"("username");

-- CreateIndex
CREATE INDEX "UserAccount_role_active_idx" ON "UserAccount"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerProfile_employeeId_key" ON "ManagerProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerProfile_accountId_key" ON "ManagerProfile"("accountId");

-- CreateIndex
CREATE INDEX "ManagerProfile_area_active_idx" ON "ManagerProfile"("area", "active");

-- CreateIndex
CREATE INDEX "ManagerProfile_department_active_idx" ON "ManagerProfile"("department", "active");

-- CreateIndex
CREATE INDEX "SectionHeadRelation_employeeId_active_idx" ON "SectionHeadRelation"("employeeId", "active");

-- CreateIndex
CREATE INDEX "SectionHeadRelation_managerId_active_idx" ON "SectionHeadRelation"("managerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_accountId_revokedAt_idx" ON "Session"("accountId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_expiresAt_idx" ON "ImportBatch"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_accountId_scope_key_key" ON "IdempotencyRecord"("accountId", "scope", "key");

-- CreateIndex
CREATE INDEX "VoiceDraft_reporterId_updatedAt_idx" ON "VoiceDraft"("reporterId", "updatedAt");

-- CreateIndex
CREATE INDEX "VoiceDraft_expiresAt_idx" ON "VoiceDraft"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Voice_displayId_key" ON "Voice"("displayId");

-- CreateIndex
CREATE INDEX "Voice_reporterId_status_updatedAt_idx" ON "Voice"("reporterId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Voice_routeOwnerId_status_severity_submittedAt_idx" ON "Voice"("routeOwnerId", "status", "severity", "submittedAt");

-- CreateIndex
CREATE INDEX "Voice_currentHandlerId_status_severity_submittedAt_idx" ON "Voice"("currentHandlerId", "status", "severity", "submittedAt");

-- CreateIndex
CREATE INDEX "Voice_visibility_status_severity_submittedAt_idx" ON "Voice"("visibility", "status", "severity", "submittedAt");

-- CreateIndex
CREATE INDEX "Voice_area_category_status_idx" ON "Voice"("area", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AIClassification_draftId_key" ON "AIClassification"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "AIClassification_voiceId_key" ON "AIClassification"("voiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_draftId_state_idx" ON "Attachment"("draftId", "state");

-- CreateIndex
CREATE INDEX "Attachment_voiceId_purpose_idx" ON "Attachment"("voiceId", "purpose");

-- CreateIndex
CREATE INDEX "Attachment_state_createdAt_idx" ON "Attachment"("state", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceAssignment_voiceId_endedAt_idx" ON "VoiceAssignment"("voiceId", "endedAt");

-- CreateIndex
CREATE INDEX "VoiceAssignment_handlerId_endedAt_idx" ON "VoiceAssignment"("handlerId", "endedAt");

-- CreateIndex
CREATE INDEX "VoiceEvent_voiceId_occurredAt_id_idx" ON "VoiceEvent"("voiceId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_voiceId_key" ON "Conversation"("voiceId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_id_idx" ON "Message"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ClosureCycle_voiceId_closedAt_idx" ON "ClosureCycle"("voiceId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClosureCycle_voiceId_cycleNumber_key" ON "ClosureCycle"("voiceId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_closureCycleId_key" ON "Rating"("closureCycleId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "PushSubscription_endpointHash_active_idx" ON "PushSubscription"("endpointHash", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_accountId_installationId_environment_key" ON "PushSubscription"("accountId", "installationId", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_id_idx" ON "AuditEvent"("occurredAt", "id");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_occurredAt_idx" ON "AuditEvent"("resourceType", "resourceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerProfile" ADD CONSTRAINT "ManagerProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerProfile" ADD CONSTRAINT "ManagerProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionHeadRelation" ADD CONSTRAINT "SectionHeadRelation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionHeadRelation" ADD CONSTRAINT "SectionHeadRelation_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceDraft" ADD CONSTRAINT "VoiceDraft_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_routeOwnerId_fkey" FOREIGN KEY ("routeOwnerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_currentHandlerId_fkey" FOREIGN KEY ("currentHandlerId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIClassification" ADD CONSTRAINT "AIClassification_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VoiceDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIClassification" ADD CONSTRAINT "AIClassification_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VoiceDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "ClosureCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceAssignment" ADD CONSTRAINT "VoiceAssignment_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceAssignment" ADD CONSTRAINT "VoiceAssignment_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceAssignment" ADD CONSTRAINT "VoiceAssignment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceEvent" ADD CONSTRAINT "VoiceEvent_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceEvent" ADD CONSTRAINT "VoiceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosureCycle" ADD CONSTRAINT "ClosureCycle_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosureCycle" ADD CONSTRAINT "ClosureCycle_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_closureCycleId_fkey" FOREIGN KEY ("closureCycleId") REFERENCES "ClosureCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CARE business invariants that Prisma cannot express as portable schema attributes.
CREATE UNIQUE INDEX "ManagerProfile_one_active_safety_per_area"
  ON "ManagerProfile" ("area") WHERE "active" = true AND "isSafety" = true;
CREATE UNIQUE INDEX "ManagerProfile_one_active_facility_per_area"
  ON "ManagerProfile" ("area") WHERE "active" = true AND "isFacility" = true;
CREATE UNIQUE INDEX "ManagerProfile_one_active_regular_per_department"
  ON "ManagerProfile" ("department")
  WHERE "active" = true AND "isSafety" = false AND "isFacility" = false;
CREATE UNIQUE INDEX "UserAccount_one_active_union"
  ON "UserAccount" (("role")) WHERE "active" = true AND "role" = 'UNION';
CREATE UNIQUE INDEX "SectionHeadRelation_one_active_per_employee"
  ON "SectionHeadRelation" ("employeeId") WHERE "active" = true;
CREATE UNIQUE INDEX "VoiceAssignment_one_active_per_voice"
  ON "VoiceAssignment" ("voiceId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "PushSubscription_endpointHash_environment_key"
  ON "PushSubscription" ("endpointHash", "environment");

ALTER TABLE "Rating" ADD CONSTRAINT "Rating_score_range" CHECK ("score" BETWEEN 1 AND 5);
ALTER TABLE "AIClassification" ADD CONSTRAINT "AIClassification_confidence_range" CHECK ("confidence" BETWEEN 0 AND 1);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_exactly_one_parent" CHECK (
  num_nonnulls("draftId", "voiceId", "messageId", "closureId") <= 1
);
