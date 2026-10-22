-- AlterTable
-- Admin edits to incomplete leader rows on an import preview.
ALTER TABLE "ImportBatch" ADD COLUMN "corrections" JSONB NOT NULL DEFAULT '{}';
