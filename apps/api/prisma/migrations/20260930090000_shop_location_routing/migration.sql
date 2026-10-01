-- CreateEnum
CREATE TYPE "ShopLocationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShopResolutionSource" AS ENUM ('ALIAS', 'AI', 'REPORTER_CONFIRMED', 'REPORTER_NOT_SHOP', 'NO_MATCH');

-- CreateEnum
CREATE TYPE "ShopConfirmation" AS ENUM ('SHOP', 'NOT_SHOP');

-- AlterEnum
ALTER TYPE "GeneralVoiceCategoryRouteMode" ADD VALUE 'LOCATION_OWNER_DEPARTMENT';

-- AlterTable
ALTER TABLE "VoiceDraft" ADD COLUMN     "confirmedShopLocationId" UUID,
ADD COLUMN     "shopConfirmation" "ShopConfirmation";

-- AlterTable
ALTER TABLE "Voice" ADD COLUMN     "shopDepartmentSnapshot" VARCHAR(200),
ADD COLUMN     "shopLocationId" UUID,
ADD COLUMN     "shopOrganizationUnitId" UUID,
ADD COLUMN     "shopResolutionSource" "ShopResolutionSource";

-- AlterTable
ALTER TABLE "LocationReviewSnapshot" ADD COLUMN     "shopConfidence" DOUBLE PRECISION,
ADD COLUMN     "shopLocationId" UUID;

-- CreateTable
CREATE TABLE "ShopLocation" (
    "id" UUID NOT NULL,
    "organizationUnitId" UUID NOT NULL,
    "areas" "Area"[],
    "aliases" TEXT[],
    "status" "ShopLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopLocation_organizationUnitId_key" ON "ShopLocation"("organizationUnitId");

-- CreateIndex
CREATE INDEX "ShopLocation_status_idx" ON "ShopLocation"("status");

-- AddForeignKey
ALTER TABLE "ShopLocation" ADD CONSTRAINT "ShopLocation_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_shopLocationId_fkey" FOREIGN KEY ("shopLocationId") REFERENCES "ShopLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

