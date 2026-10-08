-- Fixed-category deadlines (PRD §43.8): a missed window at the route owner
-- notifies instead of escalating, once per deadline.
ALTER TYPE "VoiceEventType" ADD VALUE 'DEADLINE_MISSED';
ALTER TABLE "Voice" ADD COLUMN "tierMissedDueAt" TIMESTAMP(3);
