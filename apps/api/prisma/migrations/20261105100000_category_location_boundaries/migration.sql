-- Location-based category boundaries (ADR-0078).
-- Safety and Fasilitas Umum cover shared areas and offices only, Facility
-- Repair owns building and electrical-installation repairs everywhere, and
-- in-shop safety, environment and cleanliness move to Fasilitas Kerja /
-- Kesulitan Kerja. Harassment-type reports leave Kesejahteraan because they
-- must be sent as Private Voice. Each built-in category gets a new revision
-- so earlier revisions and classification history stay intact; names and
-- routes are unchanged. Environment is archived: its cleanliness scope moved
-- to Fasilitas Umum. Admin can reactivate it from the category catalog.

UPDATE "GeneralVoiceCategoryRevision" revision
SET "effectiveTo" = CURRENT_TIMESTAMP
FROM "GeneralVoiceCategory" category
WHERE revision."categoryId" = category."id"
  AND revision."effectiveTo" IS NULL
  AND category."key" IN (
    'SAFETY',
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
    WHEN 'SAFETY' THEN '22000000-0000-4000-8000-000000000001'::uuid
    WHEN 'FACILITY' THEN '22000000-0000-4000-8000-000000000002'::uuid
    WHEN 'FACILITY_REPAIR' THEN '22000000-0000-4000-8000-000000000003'::uuid
    WHEN 'WORK_DIFFICULTY' THEN '22000000-0000-4000-8000-000000000004'::uuid
    WHEN 'WELFARE' THEN '22000000-0000-4000-8000-000000000005'::uuid
  END,
  category."id",
  latest."revision" + 1,
  latest."name",
  CASE category."key"
    WHEN 'SAFETY' THEN 'Hazard keselamatan di fasilitas umum, office, atau area bersama di luar shop, misalnya jalan pabrik, parkir, gate, lobby, kantin, toilet, tempat ibadah, rest area, smoking area, klinik, gedung office, dan jalur pedestrian umum. Pilih Safety jika penanganan utamanya adalah menghilangkan hazard, menghentikan unsafe action, mengamankan pergerakan orang atau kendaraan, atau memastikan kesiapan keadaan darurat seperti emergency exit, titik kumpul, APAR, dan hydrant. Api atau asap yang terjadi di fasilitas umum atau office termasuk Safety, apa pun sumbernya. Jika hazard, api, atau asap terjadi di dalam shop, line, workstation, atau area produksi, pilih Fasilitas Kerja atau Kesulitan Kerja. Jika masalahnya kerusakan fisik gedung, utility, atau kelistrikan tanpa api atau asap, pilih Facility Repair. Jika masalahnya kebersihan, kapasitas, atau layanan fasilitas bersama, pilih Fasilitas Umum. Jangan memilih Safety hanya karena masalah lain dapat berdampak kepada manusia. Severity dapat tetap HIGH atau CRITICAL tanpa mengubah category tersebut.'
    WHEN 'FACILITY' THEN 'Ketersediaan, kapasitas, kebersihan, kualitas layanan, jadwal, akses, atau aturan penggunaan fasilitas bersama dan office yang secara fisik masih berfungsi, di luar shop. Mencakup toilet, locker, kantin, parkir, commuter, mobil pool, tempat ibadah, rest area, smoking area, drinking water, klinik, meeting room, lobby, office, jalan pabrik, common area, dan fasilitas bersama lainnya. Pilih Fasilitas Umum untuk jumlah yang tidak cukup, kapasitas penuh, area kotor, sampah berserakan, tempat sampah penuh atau kurang, cleaning service, keterlambatan layanan, pilihan layanan, atau aturan yang tidak jelas. Jangan pilih Fasilitas Umum ketika benda, utility, atau kelistrikan rusak, bocor, retak, mati, patah, redup, mampet, atau gagal berfungsi; gunakan Facility Repair. Jika masalah terjadi di dalam shop atau area produksi, gunakan Fasilitas Kerja atau Kesulitan Kerja.'
    WHEN 'FACILITY_REPAIR' THEN 'Kerusakan atau kegagalan fisik gedung, office, ruangan, utility, sanitasi, penerangan, AC, instalasi listrik, pintu, kunci, atap, lantai, tembok, pipa, atau fasilitas bersama yang memerlukan pemeriksaan dan pekerjaan teknis. Kelistrikan yang termasuk adalah instalasi listrik gedung, office, dan fasilitas bersama: lampu, stop kontak, kabel, panel listrik gedung, listrik padam, korsleting, atau percikan listrik. Kerusakan bangunan, lampu, atau AC ruangan di gedung shop juga termasuk. Kelistrikan machine atau production equipment, seperti panel mesin trip atau kabel mesin rusak, bukan Facility Repair; gunakan Fasilitas Kerja atau Kesulitan Kerja. Jika sudah terjadi api atau asap, pilih Safety bila lokasinya fasilitas umum atau office, dan Fasilitas Kerja atau Kesulitan Kerja bila di shop. Tetap pilih Facility Repair ketika kerusakan menimbulkan risiko terpeleset, kejatuhan, paparan, gangguan operasional, atau bahaya besar; consequence tersebut menentukan severity. Jangan gunakan untuk machine, production equipment, tools, sistem IT, SOP, manpower, atau proses kerja; gunakan Fasilitas Kerja atau Kesulitan Kerja.'
    WHEN 'WORK_DIFFICULTY' THEN 'Hambatan pada pelaksanaan pekerjaan yang berasal dari machine, production equipment, tools, workstation, material handling, manpower, approval, SOP, workflow, sistem IT, ergonomi, atau sumber daya operasional lainnya, termasuk kelistrikan machine dan production equipment. Untuk kejadian di dalam shop, line, workstation, atau area produksi, Fasilitas Kerja atau Kesulitan Kerja juga mencakup safety seperti machine guarding, lockout atau tagout, APD kerja, jalur forklift, lantai licin karena ceceran proses, serta api atau asap; dan kondisi lingkungan kerja seperti kebisingan, panas dari proses, ventilasi, bau atau paparan chemical, debu, emisi, tumpahan oli atau chemical, serta kebersihan dan 5S shop. Pilih ketika tindakan utamanya adalah memperbaiki alat, proses, atau kondisi tempat kerja agar operasi produksi dan kenyamanan shop pulih. Kerusakan bangunan, lampu, AC ruangan, atau instalasi listrik gedung tetap Facility Repair walaupun terjadi di dalam shop. Safety dan kebersihan di fasilitas umum atau office bukan category ini; gunakan Safety atau Fasilitas Umum. Jangan gunakan untuk pengembangan skill, program training, career development, benefit, kompensasi, atau employee support; gunakan Kesejahteraan. Harassment, bullying, discrimination, atau retaliation bukan category ini; laporan seperti itu harus dibuat sebagai Private Voice. Dampak produksi akibat kurangnya training tidak otomatis mengubah category jika akar masalahnya tetap program pelatihan.'
    WHEN 'WELFARE' THEN 'Kesejahteraan, hak, dan dukungan bagi member. Mencakup training, pengembangan skill, career development, job rotation, benefit, kompensasi, tunjangan, reimbursement, dan employee support. Harassment, bullying, discrimination, retaliation, atau ancaman terkait pelaporan bukan category ini; laporan seperti itu harus dibuat sebagai Private Voice. Jangan gunakan untuk kekurangan manpower, kerusakan alat, approval, SOP, atau hambatan proses operasional; gunakan Fasilitas Kerja atau Kesulitan Kerja.'
  END,
  CASE category."key"
    WHEN 'SAFETY' THEN '["Motor sering ngebut di depan gate 2.","Emergency exit gedung office terkunci.","Ada asap keluar dari dapur kantin.","APAR di lobby sudah kedaluwarsa."]'::jsonb
    WHEN 'FACILITY' THEN '["Toilet kantin kotor dan jarang dibersihkan.","Tempat sampah di parkiran motor selalu penuh.","Parkiran motor sering penuh.","Commuter jemputan sering terlambat.","Menu kantin monoton.","Aturan penggunaan fasilitas belum jelas."]'::jsonb
    WHEN 'FACILITY_REPAIR' THEN '["Lampu ruang meeting mati.","AC di office tidak dingin.","Stop kontak di ruang office memercik.","AC ruangan di shop Assy mati.","Atap kantin bocor ketika hujan.","Toilet gedung office mampet."]'::jsonb
    WHEN 'WORK_DIFFICULTY' THEN '["Panel mesin press sering trip.","Lantai shop licin karena oli dari mesin.","Mesin di line kami sangat bising.","Ada asap dari mesin welding di line 2.","Jalur forklift dan pedestrian di shop bercampur.","Proses kerja terlalu banyak approval.","Sistem sering error saat digunakan."]'::jsonb
    WHEN 'WELFARE' THEN '["Training untuk meningkatkan skill kami masih kurang.","Bagaimana kesempatan career development saya?","Nilai tunjangan makan perlu ditinjau karena terlalu kecil.","Bonus atau gaji yang diterima tidak sesuai dengan penilaian dari atasan.","Tunjangan lembur, kacamata, atau reimbursement biaya berobat tidak masuk dalam penggajian."]'::jsonb
  END,
  CURRENT_TIMESTAMP,
  NULL
FROM "GeneralVoiceCategory" category
JOIN LATERAL (
  SELECT revision."revision", revision."name"
  FROM "GeneralVoiceCategoryRevision" revision
  WHERE revision."categoryId" = category."id"
  ORDER BY revision."revision" DESC
  LIMIT 1
) latest ON TRUE
WHERE category."key" IN (
    'SAFETY',
    'FACILITY',
    'FACILITY_REPAIR',
    'WORK_DIFFICULTY',
    'WELFARE'
);

UPDATE "GeneralVoiceCategory"
SET "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN (
    'SAFETY',
    'FACILITY',
    'FACILITY_REPAIR',
    'WORK_DIFFICULTY',
    'WELFARE'
);

UPDATE "GeneralVoiceCategory"
SET "status" = 'ARCHIVED',
    "archivedAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'ENVIRONMENT'
  AND "status" = 'ACTIVE';
