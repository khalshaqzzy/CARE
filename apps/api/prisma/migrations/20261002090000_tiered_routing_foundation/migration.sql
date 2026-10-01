-- CreateEnum
CREATE TYPE "EscalationTimeUnit" AS ENUM ('WORKING_DAY', 'CALENDAR_HOUR');

-- CreateEnum
CREATE TYPE "CalendarDayKind" AS ENUM ('HOLIDAY', 'WORKDAY');

-- AlterTable
ALTER TABLE "OrganizationMembership" ADD COLUMN     "area" "Area",
ADD COLUMN     "lineName" VARCHAR(200);

-- AlterTable
ALTER TABLE "Voice" ADD COLUMN     "reporterAreaSnapshot" "Area",
ADD COLUMN     "reporterLineSnapshot" VARCHAR(200);

-- CreateTable
CREATE TABLE "WorkingCalendarSetting" (
    "id" VARCHAR(40) NOT NULL,
    "useStandard" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingCalendarSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingCalendarException" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarDayKind" NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkingCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationDeadline" (
    "severity" "Severity" NOT NULL,
    "respondAmount" INTEGER NOT NULL,
    "processAmount" INTEGER NOT NULL,
    "unit" "EscalationTimeUnit" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationDeadline_pkey" PRIMARY KEY ("severity")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkingCalendarException_date_key" ON "WorkingCalendarException"("date");


-- Defaults: standard Monday-Friday calendar and the agreed per-severity windows.
INSERT INTO "WorkingCalendarSetting" ("id", "useStandard", "updatedAt")
VALUES ('default', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "EscalationDeadline" ("severity", "respondAmount", "processAmount", "unit", "updatedAt") VALUES
('LOW', 2, 3, 'WORKING_DAY', CURRENT_TIMESTAMP),
('MEDIUM', 1, 2, 'WORKING_DAY', CURRENT_TIMESTAMP),
('HIGH', 1, 1, 'WORKING_DAY', CURRENT_TIMESTAMP),
('CRITICAL', 4, 24, 'CALENDAR_HOUR', CURRENT_TIMESTAMP)
ON CONFLICT ("severity") DO NOTHING;
