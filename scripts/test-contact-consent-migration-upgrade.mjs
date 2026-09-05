import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();
const database = 'care_contact_upgrade_test';
const latest = '20260905100000_private_contact_consent';

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

psql('postgres', `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
const migrationRoot = resolve(repository, 'apps/api/prisma/migrations');
for (const directory of readdirSync(migrationRoot)
  .filter((name) => /^\d/.test(name) && name !== latest)
  .sort())
  psql(database, readFileSync(resolve(migrationRoot, directory, 'migration.sql'), 'utf8'));

psql(
  database,
  `
INSERT INTO "UserAccount" (id,username,"displayName","passwordHash","accountKind","passwordChangeRequired","updatedAt") VALUES
('91000000-0000-4000-8000-000000000001','upgrade-reporter','Upgrade Reporter','hash','WORKFORCE',false,now()),
('91000000-0000-4000-8000-000000000002','upgrade-manager','Upgrade Manager','hash','WORKFORCE',false,now());
INSERT INTO "Voice" (
  id,"displayId","reporterId",visibility,area,"reporterNoRegSnapshot","reporterNameSnapshot",
  "reporterDivisionSnapshot","reporterDepartmentSnapshot","locationDetail",title,detail,
  "categoryKey","categoryId","categoryNameSnapshot",severity,status,"routeOwnerId","handlerType",
  "anonymousAlias","updatedAt"
) VALUES (
  '92000000-0000-4000-8000-000000000001','CARE-202609-990003',
  '91000000-0000-4000-8000-000000000001','PRIVATE','KARAWANG_1','9001','Upgrade Reporter',
  'Production','Assembly','Line upgrade','Upgrade Voice','Historical content',
  'SAFETY','10000000-0000-4000-8000-000000000001','Safety','HIGH','OPEN',
  '91000000-0000-4000-8000-000000000002','MANAGER','R-UPGRADE',now()
);
INSERT INTO "VoiceEvent" (id,"voiceId",type,"actorId","actorAccountKind","actorCapabilities",payload)
VALUES ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','SUBMITTED',
  '91000000-0000-4000-8000-000000000001','WORKFORCE','["MEMBER"]','{}');
`,
);

const before = psql(
  database,
  `SELECT json_build_object(
    'voiceId',id::text,'categoryKey',"categoryKey",'categoryId',"categoryId"::text,
    'categoryName',"categoryNameSnapshot",'owner',"routeOwnerId"::text,
    'status',status::text,'version',version,'events',(SELECT count(*) FROM "VoiceEvent")
  ) FROM "Voice" WHERE id='92000000-0000-4000-8000-000000000001';`,
);
psql(database, readFileSync(resolve(migrationRoot, latest, 'migration.sql'), 'utf8'));
const after = JSON.parse(
  psql(
    database,
    `SELECT json_build_object(
  'voiceId',id::text,'categoryKey',"categoryKey",'categoryId',"categoryId"::text,
  'categoryName',"categoryNameSnapshot",'owner',"routeOwnerId"::text,
  'status',status::text,'version',version,'events',(SELECT count(*) FROM "VoiceEvent"),
  'consent',"privateContactConsent",'recordedAt',"privateContactConsentRecordedAt",'consentVersion',"privateContactConsentVersion"
) FROM "Voice" WHERE id='92000000-0000-4000-8000-000000000001';`,
  ),
);
const original = JSON.parse(before);
for (const key of Object.keys(original)) {
  if (after[key] !== original[key]) throw new Error(`Consent migration changed historical ${key}`);
}
if (after.consent !== null || after.recordedAt !== null || after.consentVersion !== null)
  throw new Error('Migration fabricated historical consent');
psql('postgres', `DROP DATABASE ${database} WITH (FORCE);`);
process.stdout.write(`Contact consent migration upgrade passed: ${JSON.stringify(after)}\n`);
