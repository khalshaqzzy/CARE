-- Additive projection. Reporter snapshots and historical events remain immutable.
ALTER TABLE "Voice"
  ADD COLUMN "handlingOrganizationUnitId" UUID,
  ADD COLUMN "handlingDirectorateSnapshot" VARCHAR(200),
  ADD COLUMN "handlingDivisionSnapshot" VARCHAR(200),
  ADD COLUMN "handlingDepartmentSnapshot" VARCHAR(200),
  ADD COLUMN "handlingSectionSnapshot" VARCHAR(200),
  ADD COLUMN "handlingOrganizationSource" VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN';

-- Handover carries the authoritative destination snapshot, even after master changes.
WITH latest AS (
  SELECT DISTINCT ON ("voiceId") * FROM "VoiceHandover" ORDER BY "voiceId", sequence DESC
)
UPDATE "Voice" v SET
  "handlingOrganizationUnitId" = h."toOrganizationUnitId",
  "handlingDirectorateSnapshot" = h."toDirectorateSnapshot",
  "handlingDivisionSnapshot" = h."toDivisionSnapshot",
  "handlingDepartmentSnapshot" = h."toDepartmentSnapshot",
  "handlingOrganizationSource" = 'HANDOVER'
FROM latest h WHERE h."voiceId" = v.id AND v.visibility = 'GENERAL'
  AND v."handlingOrganizationSource" = 'UNKNOWN';

UPDATE "Voice" v SET
  "handlingOrganizationUnitId" = u.id,
  "handlingDirectorateSnapshot" = u.directorate,
  "handlingDivisionSnapshot" = u.division,
  "handlingDepartmentSnapshot" = u.department,
  "handlingOrganizationSource" = 'ROUTE'
FROM "RouteMapping" r JOIN "OrganizationUnit" u ON u.id = r."organizationUnitId"
WHERE v."routeMappingId" = r.id AND v.visibility = 'GENERAL'
  AND v."handlingOrganizationSource" = 'UNKNOWN';

-- Resolve section only from the organization snapshot effective at assignment time.
WITH assignments AS (
  SELECT DISTINCT ON (a."voiceId") a.* FROM "VoiceAssignment" a
  JOIN "Voice" v ON v.id = a."voiceId" AND v."currentHandlerId" = a."handlerId"
  WHERE a."handlerType" = 'SECTION_HEAD' ORDER BY a."voiceId", a."assignedAt" DESC, a.id DESC
), historical AS (
  SELECT DISTINCT ON (a."voiceId") a."voiceId", m.section
  FROM assignments a JOIN "UserAccount" u ON u.id = a."handlerId"
  JOIN "OrganizationMembership" m ON m."employeeId" = u."employeeId"
  JOIN "OrganizationSnapshot" s ON s.id = m."snapshotId"
  JOIN "Voice" v ON v.id = a."voiceId" AND v."handlingOrganizationUnitId" = m."organizationUnitId"
  WHERE s."effectiveAt" <= a."assignedAt"
    AND (s."supersededAt" IS NULL OR s."supersededAt" > a."assignedAt")
    AND s.status IN ('ACTIVE', 'SUPERSEDED')
  ORDER BY a."voiceId", s."effectiveAt" DESC
)
UPDATE "Voice" v SET "handlingSectionSnapshot" = NULLIF(h.section, '')
FROM historical h WHERE v.id = h."voiceId";

DO $$ DECLARE mapped BIGINT; unresolved BIGINT; BEGIN
 SELECT count(*) FILTER (WHERE "handlingOrganizationSource" <> 'UNKNOWN'),
        count(*) FILTER (WHERE "handlingOrganizationSource" = 'UNKNOWN')
 INTO mapped, unresolved FROM "Voice" WHERE visibility = 'GENERAL';
 RAISE NOTICE 'Dashboard handling backfill: mapped=%, unresolved=%', mapped, unresolved;
END $$;
