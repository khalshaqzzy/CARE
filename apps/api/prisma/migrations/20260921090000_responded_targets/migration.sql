ALTER TYPE "VoiceStatus" RENAME VALUE 'MONITORED' TO 'RESPONDED';
ALTER TYPE "VoiceEventType" ADD VALUE 'RESPONDED';
ALTER TYPE "VoiceEventType" ADD VALUE 'TARGET_SET';
ALTER TYPE "VoiceEventType" ADD VALUE 'TARGET_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'TARGET_SET';
ALTER TYPE "NotificationType" ADD VALUE 'TARGET_OVERDUE';
ALTER TABLE "Voice" ADD COLUMN "handlingCycleNumber" INTEGER NOT NULL DEFAULT 1;
UPDATE "Voice" v SET "handlingCycleNumber" = 1 + (SELECT count(*) FROM "ClosureCycle" c WHERE c."voiceId" = v.id AND c."reopenedAt" IS NOT NULL);
ALTER TABLE "Message" ADD COLUMN "senderNameSnapshot" VARCHAR(200);
CREATE TABLE "VoiceHandlingTarget" (
 "id" UUID NOT NULL, "voiceId" UUID NOT NULL, "cycleNumber" INTEGER NOT NULL,
 "days" INTEGER NOT NULL CHECK ("days" BETWEEN 0 AND 365), "setById" UUID NOT NULL,
 "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueAt" TIMESTAMP(3) NOT NULL,
 "overdueNotifiedAt" TIMESTAMP(3), CONSTRAINT "VoiceHandlingTarget_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VoiceHandlingTarget_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VoiceHandlingTarget_voiceId_cycleNumber_key" ON "VoiceHandlingTarget"("voiceId", "cycleNumber");
CREATE INDEX "VoiceHandlingTarget_overdueNotifiedAt_dueAt_idx" ON "VoiceHandlingTarget"("overdueNotifiedAt", "dueAt");
INSERT INTO "Conversation" (id, "voiceId", "createdAt")
 SELECT gen_random_uuid(), id, CURRENT_TIMESTAMP FROM "Voice" WHERE status = 'RESPONDED'
 ON CONFLICT ("voiceId") DO NOTHING;
UPDATE "Voice" SET version = version + 1 WHERE status = 'RESPONDED';
-- Only transient replay envelopes change; immutable event payloads remain intact.
UPDATE "IdempotencyRecord" SET response = replace(response::text, '"MONITORED"', '"RESPONDED"')::jsonb WHERE response::text LIKE '%"MONITORED"%';
