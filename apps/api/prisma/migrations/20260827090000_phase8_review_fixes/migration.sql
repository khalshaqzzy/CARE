ALTER TABLE "UserAccount"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ImportChange" (
  "id" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "noReg" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImportChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImportChange_batchId_sequence_key" ON "ImportChange"("batchId", "sequence");
CREATE INDEX "ImportChange_batchId_type_sequence_id_idx" ON "ImportChange"("batchId", "type", "sequence", "id");

CREATE UNIQUE INDEX "RouteMapping_one_active_route_per_scope"
ON "RouteMapping"("kind", COALESCE("organizationUnitId", '00000000-0000-0000-0000-000000000000'::UUID))
WHERE "effectiveTo" IS NULL;

CREATE UNIQUE INDEX "UnionAccountTerm_one_active_term_per_slot"
ON "UnionAccountTerm"("slot")
WHERE "effectiveTo" IS NULL;

-- Older Admin reset/Union handlers persisted the one-time temporary password in
-- replay JSON. Drop those short-lived replay rows so an upgrade never retains
-- a usable credential at rest; a retry will safely perform a fresh mutation.
DELETE FROM "IdempotencyRecord"
WHERE "scope" LIKE 'admin:reset:%'
   OR "scope" LIKE 'admin:union:%';
