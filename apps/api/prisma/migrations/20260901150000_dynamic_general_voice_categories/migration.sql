CREATE TYPE "GeneralVoiceCategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "GeneralVoiceCategoryRouteMode" AS ENUM ('FIXED_DEPARTMENT', 'RELATED_REPORTER_DEPARTMENT');
ALTER TYPE "ImportIssueType" ADD VALUE 'CATEGORY_TARGET_UNAVAILABLE';
ALTER TYPE "ImportIssueType" ADD VALUE 'CATEGORY_PIC_UNAVAILABLE';

CREATE TABLE "GeneralVoiceCategory" (
  "id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "status" "GeneralVoiceCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "GeneralVoiceCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneralVoiceCategoryRevision" (
  "id" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "definition" VARCHAR(4000) NOT NULL,
  "examples" JSONB NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdById" UUID,
  CONSTRAINT "GeneralVoiceCategoryRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneralVoiceCategoryRoute" (
  "id" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "mode" "GeneralVoiceCategoryRouteMode" NOT NULL,
  "organizationUnitId" UUID,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdById" UUID,
  CONSTRAINT "GeneralVoiceCategoryRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeneralVoiceCategory_key_key" ON "GeneralVoiceCategory"("key");
CREATE INDEX "GeneralVoiceCategory_status_key_idx" ON "GeneralVoiceCategory"("status", "key");
CREATE UNIQUE INDEX "GeneralVoiceCategoryRevision_categoryId_revision_key" ON "GeneralVoiceCategoryRevision"("categoryId", "revision");
CREATE UNIQUE INDEX "GeneralVoiceCategoryRevision_one_active" ON "GeneralVoiceCategoryRevision"("categoryId") WHERE "effectiveTo" IS NULL;
CREATE INDEX "GeneralVoiceCategoryRevision_categoryId_effectiveTo_idx" ON "GeneralVoiceCategoryRevision"("categoryId", "effectiveTo");
CREATE UNIQUE INDEX "GeneralVoiceCategoryRoute_one_active" ON "GeneralVoiceCategoryRoute"("categoryId") WHERE "effectiveTo" IS NULL;
CREATE INDEX "GeneralVoiceCategoryRoute_categoryId_effectiveTo_idx" ON "GeneralVoiceCategoryRoute"("categoryId", "effectiveTo");
CREATE INDEX "GeneralVoiceCategoryRoute_organizationUnitId_effectiveTo_idx" ON "GeneralVoiceCategoryRoute"("organizationUnitId", "effectiveTo");

ALTER TABLE "GeneralVoiceCategory" ADD CONSTRAINT "GeneralVoiceCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneralVoiceCategoryRevision" ADD CONSTRAINT "GeneralVoiceCategoryRevision_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GeneralVoiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneralVoiceCategoryRevision" ADD CONSTRAINT "GeneralVoiceCategoryRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneralVoiceCategoryRoute" ADD CONSTRAINT "GeneralVoiceCategoryRoute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GeneralVoiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneralVoiceCategoryRoute" ADD CONSTRAINT "GeneralVoiceCategoryRoute_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneralVoiceCategoryRoute" ADD CONSTRAINT "GeneralVoiceCategoryRoute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Voice" ADD COLUMN "categoryKey" VARCHAR(80), ADD COLUMN "categoryId" UUID, ADD COLUMN "categoryNameSnapshot" VARCHAR(160);
ALTER TABLE "AIClassification" ADD COLUMN "categoryKey" VARCHAR(80), ADD COLUMN "categoryId" UUID, ADD COLUMN "categoryRevisionId" UUID;
ALTER TABLE "ImportIssue" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "ImportIssue" ADD COLUMN "categoryId" UUID;

INSERT INTO "GeneralVoiceCategory" ("id", "key") VALUES
('10000000-0000-4000-8000-000000000001', 'SAFETY'),
('10000000-0000-4000-8000-000000000002', 'ENVIRONMENT'),
('10000000-0000-4000-8000-000000000003', 'FACILITY'),
('10000000-0000-4000-8000-000000000004', 'FACILITY_REPAIR'),
('10000000-0000-4000-8000-000000000005', 'WORK_DIFFICULTY'),
('10000000-0000-4000-8000-000000000006', 'WELFARE');

INSERT INTO "GeneralVoiceCategoryRevision" ("id", "categoryId", "revision", "name", "definition", "examples") VALUES
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'Safety','Kondisi atau tindakan yang berkaitan dengan keselamatan kerja dan berpotensi menyebabkan cedera, penyakit akibat kerja, keadaan darurat, atau insiden. Mencakup unsafe condition, unsafe action, near miss, ketidaktersediaan atau ketidaksesuaian APD, jalur kerja yang tidak aman, serta akses atau sarana keadaan darurat. Pilih kategori ini ketika risiko keselamatan merupakan pokok utama Voice.','["Jalur forklift dan pedestrian sering bercampur.","Lantai area welding licin dan beberapa kali hampir membuat member terpeleset.","Ukuran safety helmet yang tersedia tidak sesuai untuk beberapa member.","Emergency exit di area kami sulit dibuka."]'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',1,'Environment','Kondisi lingkungan kerja atau lingkungan sekitar yang berkaitan dengan limbah, pencemaran, emisi, tumpahan, kebisingan, temperatur, kualitas udara, air, ventilasi, atau pengelolaan sumber daya. Pilih kategori ini ketika dampak lingkungan atau paparan lingkungan merupakan pokok utama Voice.','["Bau chemical cukup kuat di area kami.","Tempat sampah di area produksi sering penuh.","Suara mesin terlalu bising di area ini.","Area kerja sangat panas dan ventilasi kurang."]'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',1,'Fasilitas Umum','Ketersediaan, kecukupan, kualitas layanan, kapasitas, dan aturan penggunaan fasilitas bersama yang dipakai member. Mencakup toilet, locker, kantin, parkir, commuter, mobil pool, tempat ibadah, rest area, smoking area, drinking water, klinik, meeting room, common area, dan fasilitas bersama lainnya. Kerusakan fisik bangunan atau utilitas yang memerlukan pekerjaan perbaikan teknis lebih tepat masuk Facility Repair.','["Toilet wanita kurang memadai.","Parkiran motor sering penuh.","Menu kantin monoton.","Commuter jemputan sering terlambat.","Mobil pool sering tidak tersedia saat akan dipinjam.","Golf cart untuk tamu sering mogok.","Banyak locker sudah rusak.","Aturan penggunaan fasilitas belum jelas."]'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',1,'Facility Repair','Kerusakan fisik pada utility, gedung, ruangan, lantai, penerangan, AC, sanitasi, atau fasilitas umum yang membutuhkan pemeriksaan dan perbaikan teknis. Pilih kategori ini ketika pokok Voice adalah kerusakan, kebocoran, retak, mati, atau kegagalan fungsi fasilitas.','["Atap bocor ketika hujan.","Wastafel toilet sering bocor.","Tembok retak.","Lampu ruang meeting mati."]'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',1,'Fasilitas Kerja / Kesulitan Kerja','Kondisi fasilitas, alat, sumber daya, sistem, atau proses kerja yang menghambat atau menyulitkan pekerjaan. Mencakup machine, equipment, tools, workstation, material handling, manpower, approval, SOP, aktivitas manual yang dapat didigitalisasi, dan sistem IT yang mengganggu pekerjaan.','["Equipment sering breakdown.","Manpower shift malam tidak cukup.","Proses kerja terlalu banyak approval.","SOP aktual tidak sesuai dengan kondisi di lapangan.","Ada aktivitas manual yang sebenarnya dapat didigitalisasi.","Sistem sering error saat digunakan."]'),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',1,'Kesejahteraan','Kesejahteraan dan dukungan terhadap member, termasuk training, pengembangan skill, career development, job rotation, benefit, kompensasi, tunjangan, reimbursement, dan employee support. Pilih kategori ini ketika pokok Voice berkaitan dengan pengembangan, kesejahteraan, hak manfaat, atau dukungan kepada member.','["Training untuk meningkatkan skill kami masih kurang.","Bagaimana kesempatan career development saya?","Nilai tunjangan makan perlu ditinjau karena terlalu kecil.","Bonus atau gaji yang diterima tidak sesuai dengan penilaian dari atasan.","Tunjangan lembur, kacamata, atau reimbursement biaya berobat tidak masuk dalam penggajian."]');

INSERT INTO "GeneralVoiceCategoryRoute" ("id", "categoryId", "mode", "organizationUnitId") VALUES
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','FIXED_DEPARTMENT',(SELECT "id" FROM "OrganizationUnit" WHERE "directorate"='Manufacturing & PE Dir' AND "division"='Plant Administration Div' AND "department"='Plant GA & SHE Dept')),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','FIXED_DEPARTMENT',(SELECT "id" FROM "OrganizationUnit" WHERE "directorate"='Manufacturing & PE Dir' AND "division"='Plant Administration Div' AND "department"='Plant GA & SHE Dept')),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','FIXED_DEPARTMENT',(SELECT "id" FROM "OrganizationUnit" WHERE "directorate"='Manufacturing & PE Dir' AND "division"='Plant Administration Div' AND "department"='Plant GA & SHE Dept')),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','FIXED_DEPARTMENT',(SELECT "id" FROM "OrganizationUnit" WHERE "directorate"='Manufacturing & PE Dir' AND "division"='Plant Administration Div' AND "department"='Smart Plant Facility Mfg Dept')),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','RELATED_REPORTER_DEPARTMENT',NULL),
('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','RELATED_REPORTER_DEPARTMENT',NULL);

UPDATE "Voice" v SET "categoryKey"=v."category"::text, "categoryId"=c."id", "categoryNameSnapshot"=r."name" FROM "GeneralVoiceCategory" c JOIN "GeneralVoiceCategoryRevision" r ON r."categoryId"=c."id" AND r."effectiveTo" IS NULL WHERE v."category"::text=c."key";
UPDATE "AIClassification" a SET "categoryKey"=a."category"::text, "categoryId"=c."id", "categoryRevisionId"=r."id" FROM "GeneralVoiceCategory" c JOIN "GeneralVoiceCategoryRevision" r ON r."categoryId"=c."id" AND r."effectiveTo" IS NULL WHERE a."category"::text=c."key";
UPDATE "RouteMapping" SET "effectiveTo"=CURRENT_TIMESTAMP WHERE "kind"='GLOBAL_SPECIAL' AND "effectiveTo" IS NULL;
UPDATE "ImportIssue" SET "status"='SUPERSEDED', "resolvedAt"=CURRENT_TIMESTAMP WHERE "type"='INVALID_GLOBAL_PIC' AND "status"='OPEN';

ALTER TABLE "Voice" ADD CONSTRAINT "Voice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GeneralVoiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIClassification" ADD CONSTRAINT "AIClassification_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GeneralVoiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIClassification" ADD CONSTRAINT "AIClassification_categoryRevisionId_fkey" FOREIGN KEY ("categoryRevisionId") REFERENCES "GeneralVoiceCategoryRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GeneralVoiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ImportIssue_categoryId_status_idx" ON "ImportIssue"("categoryId", "status");
CREATE INDEX "Voice_area_categoryKey_status_idx" ON "Voice"("area", "categoryKey", "status");

-- Keep the legacy enum columns for one release so rollback tooling can inspect
-- the previous category vocabulary. New application writes use categoryKey.
