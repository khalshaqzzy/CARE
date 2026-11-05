CREATE TABLE "AdminPicHandover" (
  "id" UUID NOT NULL,
  "voiceId" UUID NOT NULL,
  "fromPicId" UUID NOT NULL,
  "fromHandlerId" UUID,
  "toPicId" UUID NOT NULL,
  "adminId" UUID NOT NULL,
  "previousStatus" "VoiceStatus" NOT NULL,
  "detail" VARCHAR(4000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPicHandover_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminPicHandover_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminPicHandover_fromPicId_fkey" FOREIGN KEY ("fromPicId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminPicHandover_toPicId_fkey" FOREIGN KEY ("toPicId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminPicHandover_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AdminPicHandover_voiceId_createdAt_id_idx" ON "AdminPicHandover"("voiceId", "createdAt", "id");
