-- A Private Voice about a general workplace issue offers General Voice to the
-- reporter (ADR-0078). Suggestion only; the reporter decides.
ALTER TABLE "AIClassification" ADD COLUMN "generalSuggested" BOOLEAN NOT NULL DEFAULT false;
