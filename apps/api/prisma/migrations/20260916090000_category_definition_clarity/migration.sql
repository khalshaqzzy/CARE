-- Preserve immutable category history while replacing only the six original
-- built-in Definition values. Names, Examples, routes and custom categories
-- remain unchanged.
DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "GeneralVoiceCategory" category
    JOIN "GeneralVoiceCategoryRevision" revision
      ON revision."categoryId" = category."id"
     AND revision."effectiveTo" IS NULL
    WHERE category."key" IN (
      'SAFETY',
      'ENVIRONMENT',
      'FACILITY',
      'FACILITY_REPAIR',
      'WORK_DIFFICULTY',
      'WELFARE'
    )
      AND revision."revision" = 1
  ) <> 6 THEN
    RAISE EXCEPTION 'Built-in category definitions have unexpected active revisions; rebase the definition update without overwriting Admin history';
  END IF;
END $$;

UPDATE "GeneralVoiceCategoryRevision" revision
SET "effectiveTo" = CURRENT_TIMESTAMP
FROM "GeneralVoiceCategory" category
WHERE revision."categoryId" = category."id"
  AND revision."effectiveTo" IS NULL
  AND revision."revision" = 1
  AND category."key" IN (
    'SAFETY',
    'ENVIRONMENT',
    'FACILITY',
    'FACILITY_REPAIR',
    'WORK_DIFFICULTY',
    'WELFARE'
  );

INSERT INTO "GeneralVoiceCategoryRevision" (
  "id",
  "categoryId",
  "revision",
  "name",
  "definition",
  "examples",
  "effectiveFrom",
  "createdById"
)
SELECT
  CASE category."key"
    WHEN 'SAFETY' THEN '21000000-0000-4000-8000-000000000001'::uuid
    WHEN 'ENVIRONMENT' THEN '21000000-0000-4000-8000-000000000002'::uuid
    WHEN 'FACILITY' THEN '21000000-0000-4000-8000-000000000003'::uuid
    WHEN 'FACILITY_REPAIR' THEN '21000000-0000-4000-8000-000000000004'::uuid
    WHEN 'WORK_DIFFICULTY' THEN '21000000-0000-4000-8000-000000000005'::uuid
    WHEN 'WELFARE' THEN '21000000-0000-4000-8000-000000000006'::uuid
  END,
  category."id",
  2,
  previous."name",
  CASE category."key"
    WHEN 'SAFETY' THEN 'Kondisi atau tindakan ketika penanganan utama adalah menghilangkan hazard keselamatan, menghentikan unsafe action, memulihkan safety control, menyediakan APD wajib, mengamankan pergerakan orang atau kendaraan, atau memastikan kesiapan keadaan darurat. Mencakup machine guarding, lockout atau tagout, jalur forklift dan pedestrian, APD, ergonomi berisiko, near miss, emergency exit, kebakaran, asap, percikan listrik aktif, dan mesin unsafe yang sedang dioperasikan. Jangan memilih Safety hanya karena masalah lain dapat berdampak kepada manusia. Jika sumber utamanya adalah limbah, tumpahan, emisi, bau, kebisingan, temperatur, udara, atau air, pilih Environment. Jika sumber utamanya adalah kerusakan fisik gedung, utility, lampu, AC, pintu, pipa, atau fasilitas bersama, pilih Facility Repair. Severity dapat tetap HIGH atau CRITICAL tanpa mengubah category tersebut.'
    WHEN 'ENVIRONMENT' THEN 'Kondisi ketika penanganan utama adalah mengendalikan sumber paparan atau dampak lingkungan, termasuk limbah, chemical atau oli, tumpahan, emisi, bau, debu, kebisingan, temperatur, ventilasi, kualitas udara, air, drainase, pencemaran, atau penggunaan sumber daya. Tetap pilih Environment ketika paparan menyebabkan pusing, mual, telinga berdenging, penghentian area, atau dampak serius, selama akar masalahnya adalah sumber lingkungan; severity menentukan tingkat bahayanya. Jangan berpindah ke Safety hanya karena terdapat potensi cedera. Pilih Safety apabila inti masalahnya adalah safety control atau emergency hazard seperti APD wajib yang tidak tersedia, unsafe action, kebakaran, atau percikan listrik aktif.'
    WHEN 'FACILITY' THEN 'Ketersediaan, kapasitas, kualitas layanan, jadwal, akses, atau aturan penggunaan fasilitas bersama yang secara fisik masih berfungsi. Mencakup toilet, locker, kantin, parkir, commuter, mobil pool, tempat ibadah, rest area, smoking area, drinking water, klinik, meeting room, common area, dan fasilitas bersama lainnya. Pilih Fasilitas Umum untuk jumlah yang tidak cukup, kapasitas penuh, keterlambatan layanan, pilihan layanan, atau aturan yang tidak jelas. Jangan pilih Fasilitas Umum ketika benda atau utility rusak, bocor, retak, mati, patah, atau gagal berfungsi; gunakan Facility Repair.'
    WHEN 'FACILITY_REPAIR' THEN 'Kerusakan atau kegagalan fisik gedung, utility, ruangan, sanitasi, penerangan, AC, pintu, kunci, atap, lantai, pipa, atau fasilitas bersama yang memerlukan pemeriksaan dan pekerjaan teknis. Tetap pilih Facility Repair ketika kerusakan tersebut menimbulkan risiko terpeleset, kejatuhan, paparan, gangguan operasional, atau bahaya besar; consequence tersebut menentukan severity. Jangan gunakan untuk machine, production equipment, sistem IT, SOP, manpower, atau proses kerja; gunakan Fasilitas Kerja atau Kesulitan Kerja. Api, asap, atau percikan listrik yang sedang aktif masuk Safety karena membutuhkan emergency isolation.'
    WHEN 'WORK_DIFFICULTY' THEN 'Hambatan pada pelaksanaan pekerjaan yang berasal dari machine, production equipment, tools, workstation, material handling, manpower, approval, SOP, workflow, sistem IT, atau sumber daya operasional. Pilih ketika tindakan utama adalah memperbaiki alat atau proses kerja atau memulihkan kemampuan operasi. Jangan gunakan untuk pengembangan skill, program training, career development, benefit, kompensasi, employee support, harassment, discrimination, atau retaliation; gunakan Kesejahteraan. Dampak produksi akibat kurangnya training tidak otomatis mengubah category jika akar masalahnya tetap program pelatihan.'
    WHEN 'WELFARE' THEN 'Kesejahteraan, hak, dukungan, dan perlakuan terhadap member. Mencakup training, pengembangan skill, career development, job rotation, benefit, kompensasi, tunjangan, reimbursement, employee support, interpersonal misconduct, bullying, harassment, discrimination, retaliation, ancaman terkait pelaporan, dan konflik people-related yang serius. Jangan gunakan untuk kekurangan manpower, kerusakan alat, approval, SOP, atau hambatan proses operasional; gunakan Fasilitas Kerja atau Kesulitan Kerja.'
  END,
  previous."examples",
  CURRENT_TIMESTAMP,
  previous."createdById"
FROM "GeneralVoiceCategory" category
JOIN "GeneralVoiceCategoryRevision" previous
  ON previous."categoryId" = category."id"
 AND previous."revision" = 1
WHERE category."key" IN (
  'SAFETY',
  'ENVIRONMENT',
  'FACILITY',
  'FACILITY_REPAIR',
  'WORK_DIFFICULTY',
  'WELFARE'
);

UPDATE "GeneralVoiceCategory"
SET "version" = "version" + 1
WHERE "key" IN (
  'SAFETY',
  'ENVIRONMENT',
  'FACILITY',
  'FACILITY_REPAIR',
  'WORK_DIFFICULTY',
  'WELFARE'
);
