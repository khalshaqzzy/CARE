-- Chat read receipts and admin-managed quick replies (ADR-0081).

CREATE TABLE "MessageRead" (
    "messageId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRead_pkey" PRIMARY KEY ("messageId","accountId")
);

ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Messages already opened before receipts existed count as read at the
-- participant's last chat visit (the closest time recorded).
INSERT INTO "MessageRead" ("messageId", "accountId", "readAt")
SELECT m."id", s."accountId", s."lastReadAt"
FROM "Message" m
JOIN "ConversationReadState" s ON s."conversationId" = m."conversationId"
WHERE m."kind" = 'USER'
  AND m."senderId" <> s."accountId"
  AND m."createdAt" <= s."lastReadAt"
ON CONFLICT DO NOTHING;

CREATE TYPE "QuickReplyPlacement" AS ENUM ('REPLY', 'PROCESS', 'ASSIGN', 'ESCALATE', 'HANDOVER', 'CLOSE');

CREATE TABLE "QuickReply" (
    "id" UUID NOT NULL,
    "placement" "QuickReplyPlacement" NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickReply_placement_label_key" ON "QuickReply"("placement", "label");

CREATE INDEX "QuickReply_placement_sortOrder_idx" ON "QuickReply"("placement", "sortOrder");

-- Starting set; CARE Admin edits it under Jawaban Cepat.
INSERT INTO "QuickReply" ("id", "placement", "label", "text", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'REPLY', 'Diterima', 'Terima kasih atas laporannya. Voice sudah kami terima dan segera kami tindak lanjuti.', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'REPLY', 'Cek lokasi', 'Terima kasih. Kami akan cek langsung ke lokasi.', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'REPLY', 'Minta detail', 'Mohon kirimkan foto atau detail lokasi tambahan agar bisa kami tindak lanjuti.', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'REPLY', 'Koordinasi', 'Voice ini sedang kami koordinasikan dengan pihak terkait.', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCESS', 'Saya tangani', 'Terima kasih. Voice ini saya tangani langsung sesuai target yang ditetapkan.', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCESS', 'Cek lokasi', 'Terima kasih. Kami akan cek langsung ke lokasi.', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ASSIGN', 'Diteruskan ke PIC', 'Terima kasih. Voice sudah saya tugaskan ke PIC terkait untuk ditindaklanjuti.', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ESCALATE', 'Perlu keputusan atasan', 'Perlu keputusan atasan untuk tindak lanjut Voice ini.', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ESCALATE', 'Di luar kewenangan', 'Penanganan Voice ini di luar kewenangan saya.', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ESCALATE', 'Butuh anggaran', 'Penanganan membutuhkan anggaran atau sumber daya tambahan.', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HANDOVER', 'Bukan area kami', 'Lokasi kejadian bukan area tanggung jawab kami. Mohon ditindaklanjuti oleh tim tujuan.', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HANDOVER', 'Kategori lebih sesuai', 'Kategori Voice ini lebih sesuai ditangani oleh tim tujuan.', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HANDOVER', 'Sudah dicek awal', 'Sudah dilakukan pengecekan awal; perbaikan perlu dilanjutkan oleh tim tujuan.', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CLOSE', 'Sudah diperbaiki', 'Perbaikan sudah selesai dilakukan. Foto bukti terlampir.', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CLOSE', 'Kondisi normal', 'Sudah dicek dan ditangani di lokasi; kondisi sudah kembali normal.', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CLOSE', 'Sudah ditindaklanjuti', 'Sudah dikoordinasikan dan ditindaklanjuti oleh tim terkait.', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CLOSE', 'Sudah disosialisasikan', 'Sudah disosialisasikan kepada anggota terkait.', 3, CURRENT_TIMESTAMP);
