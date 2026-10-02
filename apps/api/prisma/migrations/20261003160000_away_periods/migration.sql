-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AWAY_SUBSTITUTE';

-- CreateTable
CREATE TABLE "AwayPeriod" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "substituteId" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AwayPeriod_accountId_endedAt_endsOn_idx" ON "AwayPeriod"("accountId", "endedAt", "endsOn");

-- CreateIndex
CREATE INDEX "AwayPeriod_substituteId_endedAt_endsOn_idx" ON "AwayPeriod"("substituteId", "endedAt", "endsOn");

-- AddForeignKey
ALTER TABLE "AwayPeriod" ADD CONSTRAINT "AwayPeriod_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwayPeriod" ADD CONSTRAINT "AwayPeriod_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
