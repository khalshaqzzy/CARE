-- Voices migrated from an earlier member-voice platform keep that platform's ID.
ALTER TABLE "Voice" ADD COLUMN "legacySource" VARCHAR(80),
ADD COLUMN "legacyId" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "Voice_legacySource_legacyId_key" ON "Voice"("legacySource", "legacyId");
