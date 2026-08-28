-- CARE v1.1 expand/backfill/contract migration.
-- The application has not been deployed; nevertheless this migration preserves every
-- existing business identifier and immutable Voice relationship from the v1 baseline.

CREATE TYPE "AccountKind" AS ENUM ('CARE_ADMIN', 'WORKFORCE', 'UNION');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LEGACY_HANDLER', 'INACTIVE');
CREATE TYPE "UnionSlot" AS ENUM ('HEAD', 'OFFICER_1', 'OFFICER_2');
CREATE TYPE "OrganizationSnapshotStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');
CREATE TYPE "RouteKind" AS ENUM ('DEPARTMENT_HEAD', 'DEFAULT_DEPARTMENT', 'GLOBAL_SPECIAL', 'LEGACY');
CREATE TYPE "ImportIssueType" AS ENUM ('MISSING_DEPARTMENT_HEAD', 'ROUTE_UNAVAILABLE', 'INVALID_DEFAULT_PIC', 'INVALID_GLOBAL_PIC', 'UNION_HEAD_MISSING', 'UNION_OFFICER_MISSING', 'DEPARTMENT_14');
CREATE TYPE "ImportIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED');
CREATE TYPE "LocationCompleteness" AS ENUM ('COMPLETE', 'INCOMPLETE', 'UNKNOWN');

ALTER TYPE "RoutingCategory" ADD VALUE 'ENVIRONMENT';
ALTER TYPE "ImportStatus" ADD VALUE 'QUEUED';
ALTER TYPE "ImportStatus" ADD VALUE 'PROCESSING';

CREATE TYPE "HandlerType_v11" AS ENUM ('MANAGER', 'SECTION_HEAD', 'UNION_HEAD', 'UNION_OFFICER');
ALTER TABLE "Voice" ALTER COLUMN "handlerType" DROP DEFAULT;
ALTER TABLE "Voice" ALTER COLUMN "handlerType" TYPE "HandlerType_v11"
  USING (CASE WHEN "handlerType"::text = 'UNION' THEN 'UNION_HEAD' ELSE "handlerType"::text END)::"HandlerType_v11";
ALTER TABLE "VoiceAssignment" ALTER COLUMN "handlerType" TYPE "HandlerType_v11"
  USING (CASE WHEN "handlerType"::text = 'UNION' THEN 'UNION_HEAD' ELSE "handlerType"::text END)::"HandlerType_v11";
ALTER TYPE "HandlerType" RENAME TO "HandlerType_v1";
ALTER TYPE "HandlerType_v11" RENAME TO "HandlerType";

ALTER TABLE "UserAccount"
  ADD COLUMN "accountKind" "AccountKind",
  ADD COLUMN "status" "AccountStatus",
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

UPDATE "UserAccount" SET
  "accountKind" = CASE
    WHEN "role" = 'CARE_ADMIN' THEN 'CARE_ADMIN'::"AccountKind"
    WHEN "role" = 'UNION' THEN 'UNION'::"AccountKind"
    ELSE 'WORKFORCE'::"AccountKind"
  END,
  "status" = CASE
    WHEN NOT "active" THEN 'INACTIVE'::"AccountStatus"
    WHEN "role" = 'UNION' AND EXISTS (
      SELECT 1 FROM "Voice" v
      WHERE (v."routeOwnerId" = "UserAccount"."id" OR v."currentHandlerId" = "UserAccount"."id")
        AND v."status" IN ('OPEN', 'IN_VERIFICATION', 'IN_PROGRESS')
    ) THEN 'LEGACY_HANDLER'::"AccountStatus"
    WHEN "role" = 'UNION' THEN 'INACTIVE'::"AccountStatus"
    ELSE 'ACTIVE'::"AccountStatus"
  END,
  "deactivatedAt" = CASE WHEN NOT "active" OR "role" = 'UNION' THEN CURRENT_TIMESTAMP ELSE NULL END;

ALTER TABLE "UserAccount" ALTER COLUMN "accountKind" SET NOT NULL;
ALTER TABLE "UserAccount" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "UserAccount" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
UPDATE "Session" s SET "revokedAt" = CURRENT_TIMESTAMP
FROM "UserAccount" a
WHERE s."accountId" = a."id" AND a."status" = 'INACTIVE' AND s."revokedAt" IS NULL;

CREATE TABLE "OrganizationSnapshot" (
  "id" UUID NOT NULL,
  "status" "OrganizationSnapshotStatus" NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt" TIMESTAMP(3),
  "rowCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationUnit" (
  "id" UUID NOT NULL,
  "directorate" VARCHAR(200) NOT NULL,
  "division" VARCHAR(200) NOT NULL,
  "department" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMembership" (
  "id" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "organizationUnitId" UUID NOT NULL,
  "employeeName" VARCHAR(200) NOT NULL,
  "structuralPosition" VARCHAR(200) NOT NULL,
  "section" VARCHAR(200) NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteMapping" (
  "id" UUID NOT NULL,
  "kind" "RouteKind" NOT NULL,
  "organizationUnitId" UUID,
  "ownerAccountId" UUID NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdById" UUID,
  "reason" VARCHAR(500),
  CONSTRAINT "RouteMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UnionAccountTerm" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "slot" "UnionSlot" NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  CONSTRAINT "UnionAccountTerm_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ImportBatch"
  ADD COLUMN "baseSnapshotId" UUID,
  ADD COLUMN "failureCode" VARCHAR(100),
  ADD COLUMN "snapshotId" UUID;
UPDATE "ImportBatch" SET
  "status" = 'EXPIRED'::"ImportStatus",
  "failureCode" = 'LEGACY_IMPORT_SUPERSEDED'
WHERE "status" IN ('PREVIEWED', 'FAILED');

CREATE TABLE "ImportIssue" (
  "id" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "type" "ImportIssueType" NOT NULL,
  "status" "ImportIssueStatus" NOT NULL DEFAULT 'OPEN',
  "organizationUnitId" UUID,
  "accountId" UUID,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportIssueResolution" (
  "id" UUID NOT NULL,
  "issueId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportIssueResolution_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VoiceDraft"
  ADD COLUMN "organizationSnapshotId" UUID,
  ADD COLUMN "organizationUnitId" UUID,
  ADD COLUMN "showReporterIdentity" BOOLEAN,
  ADD COLUMN "classificationContentHash" CHAR(64),
  ADD COLUMN "locationContentHash" CHAR(64);
UPDATE "VoiceDraft" SET
  "classificationContentHash" = "contentHash",
  "locationContentHash" = "contentHash",
  "showReporterIdentity" = CASE WHEN "visibility" = 'PRIVATE' THEN false ELSE NULL END;
ALTER TABLE "VoiceDraft" ALTER COLUMN "classificationContentHash" SET NOT NULL;
ALTER TABLE "VoiceDraft" ALTER COLUMN "locationContentHash" SET NOT NULL;

ALTER TABLE "Voice"
  ADD COLUMN "reporterOrganizationSnapshotId" UUID,
  ADD COLUMN "reporterOrganizationUnitId" UUID,
  ADD COLUMN "reporterNoRegSnapshot" VARCHAR(64),
  ADD COLUMN "reporterNameSnapshot" VARCHAR(200),
  ADD COLUMN "reporterDirectorateSnapshot" VARCHAR(200),
  ADD COLUMN "reporterDivisionSnapshot" VARCHAR(200),
  ADD COLUMN "reporterDepartmentSnapshot" VARCHAR(200),
  ADD COLUMN "reporterSectionSnapshot" VARCHAR(200),
  ADD COLUMN "reporterPositionSnapshot" VARCHAR(200),
  ADD COLUMN "showReporterIdentity" BOOLEAN,
  ADD COLUMN "routeMappingId" UUID,
  ADD COLUMN "locationWarningAcknowledgedAt" TIMESTAMP(3);

UPDATE "Voice" v SET
  "reporterNoRegSnapshot" = COALESCE(e."noReg", 'LEGACY-' || v."reporterId"::text),
  "reporterNameSnapshot" = COALESCE(e."name", 'Legacy Reporter'),
  "reporterDivisionSnapshot" = COALESCE(e."division", 'Legacy Unknown'),
  "reporterDepartmentSnapshot" = v."reporterDepartment",
  "showReporterIdentity" = CASE WHEN v."visibility" = 'PRIVATE' THEN false ELSE NULL END
FROM "UserAccount" a LEFT JOIN "Employee" e ON e."id" = a."employeeId"
WHERE a."id" = v."reporterId";

ALTER TABLE "Voice" ALTER COLUMN "reporterNoRegSnapshot" SET NOT NULL;
ALTER TABLE "Voice" ALTER COLUMN "reporterNameSnapshot" SET NOT NULL;
ALTER TABLE "Voice" ALTER COLUMN "reporterDivisionSnapshot" SET NOT NULL;
ALTER TABLE "Voice" ALTER COLUMN "reporterDepartmentSnapshot" SET NOT NULL;

INSERT INTO "RouteMapping" ("id", "kind", "ownerAccountId", "effectiveFrom", "reason")
SELECT gen_random_uuid(), 'LEGACY', v."routeOwnerId", MIN(v."submittedAt"), 'v1 route owner backfill'
FROM "Voice" v GROUP BY v."routeOwnerId";
UPDATE "Voice" v SET "routeMappingId" = r."id"
FROM "RouteMapping" r
WHERE r."kind" = 'LEGACY' AND r."ownerAccountId" = v."routeOwnerId";

ALTER TABLE "AIClassification" ADD COLUMN "legacyProviderMetadata" JSONB;
UPDATE "AIClassification" SET "legacyProviderMetadata" = jsonb_build_object('location', "location")
WHERE "location" IS NOT NULL;
ALTER TABLE "AIClassification" ALTER COLUMN "category" DROP NOT NULL;

CREATE TABLE "LocationReviewSnapshot" (
  "id" UUID NOT NULL,
  "draftId" UUID,
  "voiceId" UUID,
  "model" VARCHAR(100),
  "promptVersion" VARCHAR(40) NOT NULL,
  "completeness" "LocationCompleteness" NOT NULL,
  "warning" VARCHAR(500),
  "questions" JSONB NOT NULL,
  "contentHash" CHAR(64) NOT NULL,
  "responseId" VARCHAR(200),
  "latencyMs" INTEGER,
  "fallbackCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocationReviewSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VoiceEvent"
  ADD COLUMN "actorAccountKind" "AccountKind",
  ADD COLUMN "actorStructuralPosition" VARCHAR(200),
  ADD COLUMN "actorCapabilities" JSONB;
UPDATE "VoiceEvent" SET
  "actorAccountKind" = CASE WHEN "actorRole" = 'CARE_ADMIN' THEN 'CARE_ADMIN'::"AccountKind" WHEN "actorRole" = 'UNION' THEN 'UNION'::"AccountKind" ELSE 'WORKFORCE'::"AccountKind" END,
  "actorStructuralPosition" = CASE WHEN "actorRole" IN ('MANAGER', 'SECTION_HEAD') THEN initcap(replace("actorRole"::text, '_', ' ')) ELSE NULL END,
  "actorCapabilities" = jsonb_build_array("actorRole"::text);
ALTER TABLE "VoiceEvent" ALTER COLUMN "actorAccountKind" SET NOT NULL;
ALTER TABLE "VoiceEvent" ALTER COLUMN "actorCapabilities" SET NOT NULL;

ALTER TABLE "Message"
  ADD COLUMN "senderAccountKind" "AccountKind",
  ADD COLUMN "senderStructuralPosition" VARCHAR(200),
  ADD COLUMN "senderCapabilities" JSONB;
UPDATE "Message" SET
  "senderAccountKind" = CASE WHEN "senderRole" = 'CARE_ADMIN' THEN 'CARE_ADMIN'::"AccountKind" WHEN "senderRole" = 'UNION' THEN 'UNION'::"AccountKind" ELSE 'WORKFORCE'::"AccountKind" END,
  "senderStructuralPosition" = CASE WHEN "senderRole" IN ('MANAGER', 'SECTION_HEAD') THEN initcap(replace("senderRole"::text, '_', ' ')) ELSE NULL END,
  "senderCapabilities" = jsonb_build_array("senderRole"::text);
ALTER TABLE "Message" ALTER COLUMN "senderAccountKind" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "senderCapabilities" SET NOT NULL;

ALTER TABLE "AuditEvent"
  ADD COLUMN "actorAccountKind" "AccountKind",
  ADD COLUMN "actorStructuralPosition" VARCHAR(200),
  ADD COLUMN "actorCapabilities" JSONB;
UPDATE "AuditEvent" SET
  "actorAccountKind" = CASE WHEN "actorRole" = 'CARE_ADMIN' THEN 'CARE_ADMIN'::"AccountKind" WHEN "actorRole" = 'UNION' THEN 'UNION'::"AccountKind" WHEN "actorRole" IS NULL THEN NULL ELSE 'WORKFORCE'::"AccountKind" END,
  "actorStructuralPosition" = CASE WHEN "actorRole" IN ('MANAGER', 'SECTION_HEAD') THEN initcap(replace("actorRole"::text, '_', ' ')) ELSE NULL END,
  "actorCapabilities" = CASE WHEN "actorRole" IS NULL THEN NULL ELSE jsonb_build_array("actorRole"::text) END;

CREATE TABLE "LegacyVoiceAccess" (
  "id" UUID NOT NULL,
  "voiceId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "reason" VARCHAR(100) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  CONSTRAINT "LegacyVoiceAccess_pkey" PRIMARY KEY ("id")
);
INSERT INTO "LegacyVoiceAccess" ("id", "voiceId", "accountId", "reason")
SELECT gen_random_uuid(), pair."voiceId", pair."accountId", 'ACTIVE_V1_OWNER'
FROM (
  SELECT DISTINCT v."id" AS "voiceId", access."accountId"
  FROM "Voice" v
  CROSS JOIN LATERAL (VALUES (v."routeOwnerId"), (v."currentHandlerId")) access("accountId")
  WHERE v."status" IN ('OPEN', 'IN_VERIFICATION', 'IN_PROGRESS') AND access."accountId" IS NOT NULL
) pair;

CREATE UNIQUE INDEX "OrganizationUnit_directorate_division_department_key" ON "OrganizationUnit"("directorate", "division", "department");
CREATE INDEX "OrganizationUnit_division_department_idx" ON "OrganizationUnit"("division", "department");
CREATE INDEX "OrganizationSnapshot_status_effectiveAt_idx" ON "OrganizationSnapshot"("status", "effectiveAt");
CREATE UNIQUE INDEX "OrganizationSnapshot_one_active" ON "OrganizationSnapshot" ((1)) WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "OrganizationMembership_snapshotId_employeeId_key" ON "OrganizationMembership"("snapshotId", "employeeId");
CREATE INDEX "OrganizationMembership_employeeId_snapshotId_idx" ON "OrganizationMembership"("employeeId", "snapshotId");
CREATE INDEX "OrganizationMembership_organizationUnitId_structuralPositio_idx" ON "OrganizationMembership"("organizationUnitId", "structuralPosition", "snapshotId");
CREATE INDEX "RouteMapping_kind_effectiveTo_idx" ON "RouteMapping"("kind", "effectiveTo");
CREATE INDEX "RouteMapping_organizationUnitId_effectiveTo_idx" ON "RouteMapping"("organizationUnitId", "effectiveTo");
CREATE INDEX "RouteMapping_ownerAccountId_effectiveTo_idx" ON "RouteMapping"("ownerAccountId", "effectiveTo");
CREATE UNIQUE INDEX "RouteMapping_one_active_global" ON "RouteMapping" ((1)) WHERE "kind" = 'GLOBAL_SPECIAL' AND "effectiveTo" IS NULL;
CREATE UNIQUE INDEX "RouteMapping_one_active_department" ON "RouteMapping" ("organizationUnitId") WHERE "kind" IN ('DEPARTMENT_HEAD', 'DEFAULT_DEPARTMENT') AND "effectiveTo" IS NULL;
CREATE INDEX "UnionAccountTerm_slot_effectiveTo_idx" ON "UnionAccountTerm"("slot", "effectiveTo");
CREATE INDEX "UnionAccountTerm_accountId_effectiveTo_idx" ON "UnionAccountTerm"("accountId", "effectiveTo");
CREATE UNIQUE INDEX "UnionAccountTerm_one_active_slot" ON "UnionAccountTerm" ("slot") WHERE "effectiveTo" IS NULL;
CREATE UNIQUE INDEX "UnionAccountTerm_one_active_account" ON "UnionAccountTerm" ("accountId") WHERE "effectiveTo" IS NULL;
CREATE UNIQUE INDEX "ImportBatch_snapshotId_key" ON "ImportBatch"("snapshotId");
CREATE INDEX "ImportIssue_status_type_createdAt_idx" ON "ImportIssue"("status", "type", "createdAt");
CREATE INDEX "ImportIssue_batchId_status_idx" ON "ImportIssue"("batchId", "status");
CREATE INDEX "ImportIssueResolution_issueId_createdAt_idx" ON "ImportIssueResolution"("issueId", "createdAt");
CREATE UNIQUE INDEX "LocationReviewSnapshot_draftId_key" ON "LocationReviewSnapshot"("draftId");
CREATE UNIQUE INDEX "LocationReviewSnapshot_voiceId_key" ON "LocationReviewSnapshot"("voiceId");
CREATE UNIQUE INDEX "LegacyVoiceAccess_voiceId_accountId_key" ON "LegacyVoiceAccess"("voiceId", "accountId");
CREATE INDEX "LegacyVoiceAccess_accountId_effectiveTo_idx" ON "LegacyVoiceAccess"("accountId", "effectiveTo");
CREATE INDEX "UserAccount_accountKind_status_idx" ON "UserAccount"("accountKind", "status");
CREATE INDEX "Voice_reporterOrganizationUnitId_visibility_status_idx" ON "Voice"("reporterOrganizationUnitId", "visibility", "status");

ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OrganizationSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteMapping" ADD CONSTRAINT "RouteMapping_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RouteMapping" ADD CONSTRAINT "RouteMapping_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnionAccountTerm" ADD CONSTRAINT "UnionAccountTerm_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OrganizationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportIssueResolution" ADD CONSTRAINT "ImportIssueResolution_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ImportIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoiceDraft" ADD CONSTRAINT "VoiceDraft_organizationSnapshotId_fkey" FOREIGN KEY ("organizationSnapshotId") REFERENCES "OrganizationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VoiceDraft" ADD CONSTRAINT "VoiceDraft_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_reporterOrganizationSnapshotId_fkey" FOREIGN KEY ("reporterOrganizationSnapshotId") REFERENCES "OrganizationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_reporterOrganizationUnitId_fkey" FOREIGN KEY ("reporterOrganizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_routeMappingId_fkey" FOREIGN KEY ("routeMappingId") REFERENCES "RouteMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LocationReviewSnapshot" ADD CONSTRAINT "LocationReviewSnapshot_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VoiceDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LocationReviewSnapshot" ADD CONSTRAINT "LocationReviewSnapshot_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LegacyVoiceAccess" ADD CONSTRAINT "LegacyVoiceAccess_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegacyVoiceAccess" ADD CONSTRAINT "LegacyVoiceAccess_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "UserAccount_role_active_idx";
ALTER TABLE "ManagerProfile" DROP CONSTRAINT "ManagerProfile_employeeId_fkey";
ALTER TABLE "ManagerProfile" DROP CONSTRAINT "ManagerProfile_accountId_fkey";
ALTER TABLE "SectionHeadRelation" DROP CONSTRAINT "SectionHeadRelation_employeeId_fkey";
ALTER TABLE "SectionHeadRelation" DROP CONSTRAINT "SectionHeadRelation_managerId_fkey";
DROP TABLE "ManagerProfile";
DROP TABLE "SectionHeadRelation";

ALTER TABLE "Employee" DROP COLUMN "division", DROP COLUMN "department";
ALTER TABLE "UserAccount" DROP COLUMN "role", DROP COLUMN "active";
ALTER TABLE "ImportBatch" DROP COLUMN "type";
ALTER TABLE "VoiceDraft" DROP COLUMN "contentHash", DROP COLUMN "reporterDepartment";
ALTER TABLE "Voice" DROP COLUMN "reporterDepartment";
ALTER TABLE "AIClassification" DROP COLUMN "location";
ALTER TABLE "VoiceEvent" DROP COLUMN "actorRole";
ALTER TABLE "Message" DROP COLUMN "senderRole";
ALTER TABLE "AuditEvent" DROP COLUMN "actorRole";
DROP TYPE "HandlerType_v1";
DROP TYPE "Role";
DROP TYPE "ImportType";
