-- Route the seeded Fasilitas Kerja / Kesulitan Kerja category by incident
-- location owner. Only the untouched seed route (reporter department) is
-- replaced; an Admin-customized route is preserved. The new enum value was
-- added in the previous migration so it can be used here.
WITH target AS (
  SELECT r."id" AS "routeId", r."categoryId"
  FROM "GeneralVoiceCategoryRoute" r
  JOIN "GeneralVoiceCategory" c ON c."id" = r."categoryId"
  WHERE c."key" = 'WORK_DIFFICULTY'
    AND r."effectiveTo" IS NULL
    AND r."mode" = 'RELATED_REPORTER_DEPARTMENT'
), closed AS (
  UPDATE "GeneralVoiceCategoryRoute" r
  SET "effectiveTo" = CURRENT_TIMESTAMP
  FROM target
  WHERE r."id" = target."routeId"
  RETURNING r."categoryId"
), bumped AS (
  UPDATE "GeneralVoiceCategory" c
  SET "version" = c."version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  FROM closed
  WHERE c."id" = closed."categoryId"
  RETURNING c."id"
)
INSERT INTO "GeneralVoiceCategoryRoute" ("id", "categoryId", "mode", "organizationUnitId", "effectiveFrom")
SELECT gen_random_uuid(), bumped."id", 'LOCATION_OWNER_DEPARTMENT', NULL, CURRENT_TIMESTAMP
FROM bumped;
