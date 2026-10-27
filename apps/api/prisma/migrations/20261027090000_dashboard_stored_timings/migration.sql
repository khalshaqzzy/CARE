-- Dashboard timings stored at write time (ADR-0071): the first and latest
-- response per Voice, and the start of each closure cycle. Database triggers
-- keep them exact for every writer, so application code never sets them.

-- AlterTable
ALTER TABLE "ClosureCycle" ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VoiceResponseTiming" (
    "voiceId" UUID NOT NULL,
    "firstResponseAt" TIMESTAMP(3) NOT NULL,
    "lastResponseAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceResponseTiming_pkey" PRIMARY KEY ("voiceId")
);

-- AddForeignKey
ALTER TABLE "VoiceResponseTiming" ADD CONSTRAINT "VoiceResponseTiming_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from history.
INSERT INTO "VoiceResponseTiming" ("voiceId", "firstResponseAt", "lastResponseAt")
SELECT "voiceId", min("occurredAt"), max("occurredAt")
FROM "VoiceEvent"
WHERE type IN ('MONITORED', 'RESPONDED')
GROUP BY "voiceId";

UPDATE "ClosureCycle" c SET "startedAt" = v."submittedAt"
FROM "Voice" v
WHERE v.id = c."voiceId" AND c."cycleNumber" = 1;

UPDATE "ClosureCycle" c SET "startedAt" = previous."reopenedAt"
FROM "ClosureCycle" previous
WHERE previous."voiceId" = c."voiceId" AND previous."cycleNumber" = c."cycleNumber" - 1;

-- A response event widens its Voice's first/latest response window.
CREATE FUNCTION care_record_response_timing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "VoiceResponseTiming" ("voiceId", "firstResponseAt", "lastResponseAt")
  VALUES (NEW."voiceId", NEW."occurredAt", NEW."occurredAt")
  ON CONFLICT ("voiceId") DO UPDATE SET
    "firstResponseAt" = LEAST("VoiceResponseTiming"."firstResponseAt", EXCLUDED."firstResponseAt"),
    "lastResponseAt" = GREATEST("VoiceResponseTiming"."lastResponseAt", EXCLUDED."lastResponseAt");
  RETURN NULL;
END;
$$;

CREATE TRIGGER "VoiceEvent_response_timing"
AFTER INSERT ON "VoiceEvent"
FOR EACH ROW WHEN (NEW.type IN ('MONITORED', 'RESPONDED'))
EXECUTE FUNCTION care_record_response_timing();

-- A new cycle starts at submit (first cycle) or at the previous cycle's reopen.
CREATE FUNCTION care_set_cycle_start() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."startedAt" := CASE WHEN NEW."cycleNumber" = 1
    THEN (SELECT "submittedAt" FROM "Voice" WHERE id = NEW."voiceId")
    ELSE (SELECT "reopenedAt" FROM "ClosureCycle"
          WHERE "voiceId" = NEW."voiceId" AND "cycleNumber" = NEW."cycleNumber" - 1)
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClosureCycle_set_start"
BEFORE INSERT ON "ClosureCycle"
FOR EACH ROW EXECUTE FUNCTION care_set_cycle_start();

-- Reopening a cycle (or correcting its reopen time) moves the next cycle's start.
CREATE FUNCTION care_follow_cycle_reopen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "ClosureCycle" SET "startedAt" = NEW."reopenedAt"
  WHERE "voiceId" = NEW."voiceId" AND "cycleNumber" = NEW."cycleNumber" + 1;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "ClosureCycle_follow_reopen"
AFTER UPDATE OF "reopenedAt" ON "ClosureCycle"
FOR EACH ROW WHEN (NEW."reopenedAt" IS DISTINCT FROM OLD."reopenedAt")
EXECUTE FUNCTION care_follow_cycle_reopen();
