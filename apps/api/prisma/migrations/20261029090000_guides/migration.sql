-- Panduan managed in CARE Admin (ADR-0075). PDF files live under MEDIA_ROOT/guides;
-- video guides are external https links.

-- CreateEnum
CREATE TYPE "GuideKind" AS ENUM ('PDF', 'VIDEO');

-- CreateTable
CREATE TABLE "Guide" (
    "id" UUID NOT NULL,
    "kind" "GuideKind" NOT NULL DEFAULT 'PDF',
    "title" VARCHAR(120) NOT NULL,
    "forMember" BOOLEAN NOT NULL DEFAULT false,
    "forResponder" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "videoUrl" VARCHAR(500),
    "storageKey" VARCHAR(200),
    "fileName" VARCHAR(200),
    "size" INTEGER,
    "checksum" CHAR(64),
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Guide_kind_content_check" CHECK (
        ("kind" = 'PDF' AND "storageKey" IS NOT NULL AND "videoUrl" IS NULL)
        OR ("kind" = 'VIDEO' AND "videoUrl" IS NOT NULL AND "storageKey" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "Guide_storageKey_key" ON "Guide"("storageKey");

-- CreateIndex
CREATE INDEX "Guide_sortOrder_createdAt_idx" ON "Guide"("sortOrder", "createdAt");

-- AddForeignKey
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
