-- AlterTable
-- A Division Admin reads one division of one directorate in CARE Admin.
ALTER TABLE "UserAccount"
  ADD COLUMN "adminDirectorate" VARCHAR(200),
  ADD COLUMN "adminDivision" VARCHAR(200);

ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_division_admin_scope" CHECK (
  ("accountKind" = 'DIVISION_ADMIN') = ("adminDirectorate" IS NOT NULL AND "adminDivision" IS NOT NULL)
);

-- One active Division Admin per division.
CREATE UNIQUE INDEX "UserAccount_active_division_admin_key"
  ON "UserAccount" ("adminDirectorate", "adminDivision")
  WHERE "accountKind" = 'DIVISION_ADMIN' AND "status" = 'ACTIVE';
