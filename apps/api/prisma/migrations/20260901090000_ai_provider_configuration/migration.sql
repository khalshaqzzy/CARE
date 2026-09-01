CREATE TABLE "AiProviderConfiguration" (
    "id" VARCHAR(40) NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" VARCHAR(200) NOT NULL,
    "reasoningEffort" VARCHAR(20) NOT NULL,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL,
    "apiKeyCiphertext" TEXT NOT NULL,
    "apiKeyIv" VARCHAR(32) NOT NULL,
    "apiKeyTag" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiProviderConfiguration_updatedById_idx"
ON "AiProviderConfiguration"("updatedById");

ALTER TABLE "AiProviderConfiguration"
ADD CONSTRAINT "AiProviderConfiguration_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "UserAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
