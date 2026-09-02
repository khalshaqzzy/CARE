-- Closure review window: additive migration. The schema drift reconciliation
-- churn (index sort order, FK referential actions, updatedAt default from the
-- hand-edited dynamic-category migration) is intentionally omitted so this
-- migration stays purely additive; that drift is pre-existing and behaviorally
-- harmless.
CREATE TYPE "ClosureReviewState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TYPE "NotificationType" ADD VALUE 'CLOSURE_AUTO_ACCEPTED';

ALTER TYPE "VoiceEventType" ADD VALUE 'AUTO_ACCEPTED';

ALTER TABLE "ClosureCycle" ADD COLUMN     "reviewDeadline" TIMESTAMP(3),
ADD COLUMN     "reviewResolvedAt" TIMESTAMP(3),
ADD COLUMN     "reviewState" "ClosureReviewState" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "ClosureCycle_reviewState_reviewDeadline_idx" ON "ClosureCycle"("reviewState", "reviewDeadline");

-- Backfill existing closure cycles with the resolved review window.
UPDATE "ClosureCycle" SET "reviewDeadline" = "closedAt" + interval '2 days'
WHERE "reviewDeadline" IS NULL;

UPDATE "ClosureCycle" SET "reviewState" = 'REJECTED', "reviewResolvedAt" = "reopenedAt"
WHERE "reopenedAt" IS NOT NULL;

UPDATE "ClosureCycle" SET "reviewState" = 'ACCEPTED', "reviewResolvedAt" = "Rating"."createdAt"
FROM "Rating"
WHERE "Rating"."closureCycleId" = "ClosureCycle"."id"
  AND "ClosureCycle"."reopenedAt" IS NULL;

UPDATE "ClosureCycle" SET "reviewState" = 'ACCEPTED', "reviewResolvedAt" = "closedAt" + interval '2 days'
WHERE "reopenedAt" IS NULL
  AND "reviewState" = 'PENDING'
  AND NOT EXISTS (SELECT 1 FROM "Rating" WHERE "Rating"."closureCycleId" = "ClosureCycle"."id")
  AND "closedAt" + interval '2 days' <= CURRENT_TIMESTAMP;
