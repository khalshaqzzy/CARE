-- Coordinated API/workforce/Admin release: old applications must be stopped first.
ALTER TYPE "VoiceStatus" RENAME VALUE 'IN_VERIFICATION' TO 'MONITORED';
ALTER TYPE "VoiceEventType" ADD VALUE 'MONITORED';

-- Preserve historical timestamps, messages and actors. No user actions are fabricated.
CREATE TEMP TABLE lifecycle_affected ON COMMIT PRESERVE ROWS AS
SELECT v."id" FROM "Voice" v
WHERE v."status" = 'MONITORED'
   OR (v."status" = 'IN_PROGRESS' AND (v."currentHandlerId" IS NULL
       OR NOT EXISTS (SELECT 1 FROM "Conversation" c WHERE c."voiceId" = v."id")));

UPDATE "Voice" v SET "status" = 'IN_PROGRESS'
WHERE v."status" = 'MONITORED' AND (
  EXISTS (SELECT 1 FROM "Conversation" c JOIN "Message" m ON m."conversationId" = c."id" WHERE c."voiceId" = v."id")
  OR EXISTS (SELECT 1 FROM "VoiceEvent" e WHERE e."voiceId" = v."id" AND e."type" = 'REOPENED')
  OR EXISTS (SELECT 1 FROM "ClosureCycle" c WHERE c."voiceId" = v."id" AND c."reopenedAt" IS NOT NULL)
);
UPDATE "Voice" SET "currentHandlerId" = "routeOwnerId",
  "handlerType" = CASE WHEN "visibility" = 'PRIVATE' THEN 'UNION_HEAD'::"HandlerType" ELSE 'MANAGER'::"HandlerType" END
WHERE "status" = 'IN_PROGRESS' AND "currentHandlerId" IS NULL;
INSERT INTO "Conversation" ("id", "voiceId", "createdAt")
SELECT gen_random_uuid(), v."id", v."updatedAt" FROM "Voice" v
WHERE v."status" = 'IN_PROGRESS'
ON CONFLICT ("voiceId") DO NOTHING;
UPDATE "Voice" SET "version" = "version" + 1 WHERE "id" IN (SELECT "id" FROM lifecycle_affected);
DO $$ BEGIN RAISE NOTICE 'Voice lifecycle migrated: % records', (SELECT count(*) FROM lifecycle_affected); END $$;

-- Replay envelopes are transient API results, not immutable Voice history.
UPDATE "IdempotencyRecord"
SET "response" = jsonb_set("response", '{status}', '"MONITORED"'::jsonb)
WHERE "response"->>'status' = 'IN_VERIFICATION';
