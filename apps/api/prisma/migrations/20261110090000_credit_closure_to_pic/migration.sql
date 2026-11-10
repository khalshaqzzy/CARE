-- A General Voice's completion is credited to the PIC who handled it, not to
-- whoever pressed Selesai or Laporkan selesai (ADR-0084). Substitutes acting
-- for an away PIC used to be credited themselves; move those credits to the
-- PIC still recorded as the Voice's handler. Migrated Voices, Private Voices
-- and Voices without a recorded handler are left as they are.

-- The open (never reopened) closure of a closed General Voice.
UPDATE "ClosureCycle" c
SET "actorId" = v."currentHandlerId"
FROM "Voice" v
WHERE v.id = c."voiceId"
  AND v.visibility = 'GENERAL'
  AND v.status = 'CLOSED'
  AND v."legacySource" IS NULL
  AND v."currentHandlerId" IS NOT NULL
  AND c."reopenedAt" IS NULL
  AND c."actorId" <> v."currentHandlerId";

-- A report done still waiting for approval.
UPDATE "ClosureReport" r
SET "actorId" = v."currentHandlerId"
FROM "Voice" v
WHERE v.id = r."voiceId"
  AND v.visibility = 'GENERAL'
  AND v.status = 'IN_PROGRESS'
  AND v."currentHandlerId" IS NOT NULL
  AND r.state = 'PENDING'
  AND r."actorId" <> v."currentHandlerId";

UPDATE "Voice"
SET "closureReportedById" = "currentHandlerId"
WHERE visibility = 'GENERAL'
  AND status = 'IN_PROGRESS'
  AND "currentHandlerId" IS NOT NULL
  AND "closureReportedById" IS NOT NULL
  AND "closureReportedById" <> "currentHandlerId";
