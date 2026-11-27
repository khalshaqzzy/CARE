-- PIC gets a reminder every working day at 08:00 WIB while the target is
-- overdue and the Voice is still in progress (ADR-0086).
ALTER TABLE "VoiceHandlingTarget" ADD COLUMN "overdueRemindedAt" TIMESTAMP(3);
