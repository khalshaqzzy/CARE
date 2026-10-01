import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();
const database = 'care_shop_routing_upgrade_test';
const first = '20260930090000_shop_location_routing';
const routeMigration = '20260930090100_work_difficulty_location_owner_route';

function psql(target, input) {
  const runtimeUrl = process.env.DATABASE_URL;
  const command = runtimeUrl ? 'psql' : 'docker';
  const args = runtimeUrl
    ? [
        (() => {
          const url = new URL(runtimeUrl);
          url.pathname = `/${target}`;
          return url.toString();
        })(),
        '-v',
        'ON_ERROR_STOP=1',
        '-tA',
      ]
    : [
        'compose',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'care',
        '-d',
        target,
        '-tA',
      ];
  const result = spawnSync(command, args, { cwd: repository, input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'psql failed');
  return result.stdout.trim();
}

const migrationRoot = resolve(repository, 'apps/api/prisma/migrations');
const migration = (name) => readFileSync(resolve(migrationRoot, name, 'migration.sql'), 'utf8');

function prepare() {
  psql(
    'postgres',
    `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`,
  );
  for (const directory of readdirSync(migrationRoot)
    .filter((name) => /^\d/.test(name) && name < first)
    .sort())
    psql(database, migration(directory));
  psql(
    database,
    `
INSERT INTO "UserAccount" (id,username,"displayName","passwordHash","accountKind","passwordChangeRequired","updatedAt") VALUES
('95000000-0000-4000-8000-000000000001','shop-upgrade-reporter','Shop Upgrade Reporter','hash','WORKFORCE',false,now()),
('95000000-0000-4000-8000-000000000002','shop-upgrade-manager','Shop Upgrade Manager','hash','WORKFORCE',false,now());
INSERT INTO "Voice" (
  id,"displayId","reporterId",visibility,area,"reporterNoRegSnapshot","reporterNameSnapshot",
  "reporterDivisionSnapshot","reporterDepartmentSnapshot","locationDetail",title,detail,
  "categoryKey","categoryId","categoryNameSnapshot",severity,status,"routeOwnerId","handlerType",
  "anonymousAlias","updatedAt"
) VALUES (
  '96000000-0000-4000-8000-000000000001','CARE-202609-990101',
  '95000000-0000-4000-8000-000000000001','GENERAL','KARAWANG_1','9101','Shop Upgrade Reporter',
  'Production','Assembly','assy line 2','Historical work difficulty','Historical content',
  'WORK_DIFFICULTY','10000000-0000-4000-8000-000000000005','Fasilitas Kerja / Kesulitan Kerja',
  'MEDIUM','OPEN','95000000-0000-4000-8000-000000000002','MANAGER','R-SHOP-UPGRADE',now()
);
`,
  );
}

const routes = () =>
  JSON.parse(
    psql(
      database,
      `SELECT json_build_object(
        'workActive', (SELECT r.mode::text FROM "GeneralVoiceCategoryRoute" r
          JOIN "GeneralVoiceCategory" c ON c.id = r."categoryId"
          WHERE c.key = 'WORK_DIFFICULTY' AND r."effectiveTo" IS NULL),
        'workActiveCount', (SELECT count(*) FROM "GeneralVoiceCategoryRoute" r
          JOIN "GeneralVoiceCategory" c ON c.id = r."categoryId"
          WHERE c.key = 'WORK_DIFFICULTY' AND r."effectiveTo" IS NULL),
        'workHistory', (SELECT count(*) FROM "GeneralVoiceCategoryRoute" r
          JOIN "GeneralVoiceCategory" c ON c.id = r."categoryId" WHERE c.key = 'WORK_DIFFICULTY'),
        'workVersion', (SELECT version FROM "GeneralVoiceCategory" WHERE key = 'WORK_DIFFICULTY'),
        'welfareActive', (SELECT r.mode::text FROM "GeneralVoiceCategoryRoute" r
          JOIN "GeneralVoiceCategory" c ON c.id = r."categoryId"
          WHERE c.key = 'WELFARE' AND r."effectiveTo" IS NULL)
      );`,
    ),
  );
const assert = (condition, message, detail) => {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(detail)}`);
};

// Seeded reporter-department route moves to the incident location owner.
prepare();
const seeded = routes();
assert(seeded.workActive === 'RELATED_REPORTER_DEPARTMENT', 'unexpected seed route', seeded);
psql(database, migration(first));
psql(database, migration(routeMigration));
const upgraded = routes();
assert(
  upgraded.workActive === 'LOCATION_OWNER_DEPARTMENT' &&
    upgraded.workActiveCount === 1 &&
    upgraded.workHistory === seeded.workHistory + 1 &&
    upgraded.workVersion === seeded.workVersion + 1 &&
    upgraded.welfareActive === 'RELATED_REPORTER_DEPARTMENT',
  'seeded route was not upgraded',
  { seeded, upgraded },
);
const voice = JSON.parse(
  psql(
    database,
    `SELECT json_build_object('shop', "shopLocationId", 'source', "shopResolutionSource",
      'owner', "routeOwnerId"::text, 'category', "categoryKey")
     FROM "Voice" WHERE id = '96000000-0000-4000-8000-000000000001';`,
  ),
);
assert(
  voice.shop === null &&
    voice.source === null &&
    voice.owner === '95000000-0000-4000-8000-000000000002' &&
    voice.category === 'WORK_DIFFICULTY',
  'historical Voice changed',
  voice,
);

// An Admin-customized route is preserved.
prepare();
psql(
  database,
  `UPDATE "GeneralVoiceCategoryRoute" r SET mode = 'FIXED_DEPARTMENT'
   FROM "GeneralVoiceCategory" c
   WHERE c.id = r."categoryId" AND c.key = 'WORK_DIFFICULTY' AND r."effectiveTo" IS NULL;`,
);
const customized = routes();
psql(database, migration(first));
psql(database, migration(routeMigration));
const preserved = routes();
assert(JSON.stringify(preserved) === JSON.stringify(customized), 'customized route was changed', {
  customized,
  preserved,
});

psql('postgres', `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
process.stdout.write(
  `Shop routing migration upgrade passed: ${JSON.stringify({ seeded, upgraded, voice })}\n`,
);
