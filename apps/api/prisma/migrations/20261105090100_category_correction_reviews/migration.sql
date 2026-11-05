-- CARE Admin decisions on General Voices whose category changed after submit
-- (ADR-0079). Accepted corrections add an Example to the target category.
CREATE TYPE "CategoryCorrectionDecision" AS ENUM ('ACCEPTED', 'DISMISSED');

CREATE TABLE "CategoryCorrectionReview" (
    "id" UUID NOT NULL,
    "voiceId" UUID NOT NULL,
    "fromCategoryKey" VARCHAR(80) NOT NULL,
    "toCategoryKey" VARCHAR(80) NOT NULL,
    "decision" "CategoryCorrectionDecision" NOT NULL,
    "example" VARCHAR(1000),
    "categoryRevisionId" UUID,
    "reviewedById" UUID NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryCorrectionReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryCorrectionReview_voiceId_toCategoryKey_key" ON "CategoryCorrectionReview"("voiceId", "toCategoryKey");

ALTER TABLE "CategoryCorrectionReview" ADD CONSTRAINT "CategoryCorrectionReview_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoryCorrectionReview" ADD CONSTRAINT "CategoryCorrectionReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
