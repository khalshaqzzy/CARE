-- AlterTable
-- Login tracking starts with this release: existing accounts stay NULL ("not since tracking began").
ALTER TABLE "UserAccount"
  ADD COLUMN "firstLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);
