import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();
const database = 'care_dashboard_upgrade_test';
const latest = '20260907090000_dashboard_handling_projection';

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
try {
  for (const directory of readdirSync(migrationRoot)
    .filter((name) => /^\d/.test(name) && name < latest)
    .sort())
    psql(database, readFileSync(resolve(migrationRoot, directory, 'migration.sql'), 'utf8'));
  psql(
    database,
    `
 INSERT INTO "Employee" (id,"noReg",name,"updatedAt") VALUES ('91000000-0000-4000-8000-000000000001','dash-upgrade','Section Head',now());
 INSERT INTO "UserAccount" (id,username,"displayName","passwordHash","accountKind","employeeId","updatedAt") VALUES
 ('91000000-0000-4000-8000-000000000002','dash-upgrade','Historical Head','hash','WORKFORCE','91000000-0000-4000-8000-000000000001',now());
 INSERT INTO "OrganizationUnit" (id,directorate,division,department) VALUES
 ('92000000-0000-4000-8000-000000000001','D','V','Dept A');
 INSERT INTO "OrganizationSnapshot" (id,status,checksum,"rowCount","effectiveAt","supersededAt") VALUES
 ('93000000-0000-4000-8000-000000000001','SUPERSEDED',repeat('a',64),1,'2026-01-01','2026-06-01'),
 ('93000000-0000-4000-8000-000000000002','ACTIVE',repeat('b',64),1,'2026-06-01',null);
 INSERT INTO "OrganizationMembership" (id,"snapshotId","employeeId","organizationUnitId","employeeName","structuralPosition",section,"sourceRow") VALUES
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Head','Section Head','Historical Section',1),
 ('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Head','Section Head','New Section',1);
 INSERT INTO "RouteMapping" (id,kind,"organizationUnitId","ownerAccountId") VALUES
 ('95000000-0000-4000-8000-000000000001','DEPARTMENT_HEAD','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002');
 INSERT INTO "Voice" (id,"displayId","reporterId",visibility,area,"reporterNoRegSnapshot","reporterNameSnapshot","reporterDivisionSnapshot","reporterDepartmentSnapshot","locationDetail",title,detail,severity,status,"routeOwnerId","routeMappingId","currentHandlerId","handlerType","anonymousAlias","submittedAt","updatedAt") VALUES
 ('96000000-0000-4000-8000-000000000001','CARE-202609-990005','91000000-0000-4000-8000-000000000002','GENERAL','KARAWANG_1','9001','Reporter','Origin division','Origin department','Line','Historical voice','Historical content','HIGH','CLOSED','91000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','SECTION_HEAD','Alias','2026-02-01',now()),
 ('96000000-0000-4000-8000-000000000002','CARE-202609-990006','91000000-0000-4000-8000-000000000002','GENERAL','KARAWANG_1','9001','Reporter','Origin division','Origin department','Line','Unknown voice','Historical content','HIGH','OPEN','91000000-0000-4000-8000-000000000002',null,null,'MANAGER','Alias','2026-02-01',now());
 INSERT INTO "VoiceAssignment" (id,"voiceId","handlerId","handlerType","actorId","assignedAt") VALUES
 ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','SECTION_HEAD','91000000-0000-4000-8000-000000000002','2026-02-02');
 `,
  );
  const migration = readFileSync(resolve(migrationRoot, latest, 'migration.sql'), 'utf8');
  psql(database, migration);
  const read = () =>
    JSON.parse(
      psql(
        database,
        `SELECT json_agg(json_build_object('id', id, 'department',"handlingDepartmentSnapshot",'section',"handlingSectionSnapshot",'source',"handlingOrganizationSource",'reporter',"reporterDepartmentSnapshot",'version',version) ORDER BY id) FROM "Voice";`,
      ),
    );
  const first = read();
  if (first[0].department !== 'Dept A' || first[0].section !== 'Historical Section')
    throw new Error('Backfill used current rather than assignment-time organization');
  if (first[1].source !== 'UNKNOWN' || first[1].department !== null)
    throw new Error('Backfill fabricated unknown history');
  if (first.some((row) => row.reporter !== 'Origin department' || row.version !== 1))
    throw new Error('Backfill changed immutable business history');
  psql(database, migration.slice(migration.indexOf('-- Handover')));
  if (JSON.stringify(read()) !== JSON.stringify(first))
    throw new Error('Backfill is not idempotent');
  process.stdout.write(
    'Dashboard migration upgrade passed: historical section, unknown fallback, immutable history and idempotent backfill\n',
  );
} finally {
  psql('postgres', `DROP DATABASE ${database} WITH (FORCE);`);
}
