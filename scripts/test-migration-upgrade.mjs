import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();
const database = 'care_upgrade_test';
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
psql(
  database,
  readFileSync(
    resolve(repository, 'apps/api/prisma/migrations/20260824043057_init/migration.sql'),
    'utf8',
  ),
);
psql(
  database,
  `
INSERT INTO "Employee" (id,"noReg",name,division,department,"updatedAt") VALUES
('10000000-0000-4000-a000-000000000001','000001','Reporter','Division A','Department A',now()),
('10000000-0000-4000-a000-000000000002','000002','Manager','Division A','Department A',now()),
('10000000-0000-4000-a000-000000000003','000003','Section Head','Division A','Department A',now());
INSERT INTO "UserAccount" (id,"employeeId",username,"displayName","passwordHash",role,"updatedAt") VALUES
('20000000-0000-4000-a000-000000000001','10000000-0000-4000-a000-000000000001','000001','Reporter','hash','MEMBER',now()),
('20000000-0000-4000-a000-000000000002','10000000-0000-4000-a000-000000000002','000002','Manager','hash','MANAGER',now()),
('20000000-0000-4000-a000-000000000003','10000000-0000-4000-a000-000000000003','000003','Section Head','hash','SECTION_HEAD',now()),
('20000000-0000-4000-a000-000000000004',NULL,'legacy-union','Legacy Union','hash','UNION',now());
INSERT INTO "ManagerProfile" (id,"employeeId","accountId",area,department,"updatedAt") VALUES ('30000000-0000-4000-a000-000000000001','10000000-0000-4000-a000-000000000002','20000000-0000-4000-a000-000000000002','KARAWANG_1','Department A',now());
INSERT INTO "SectionHeadRelation" (id,"employeeId","managerId") VALUES ('30000000-0000-4000-a000-000000000002','10000000-0000-4000-a000-000000000003','20000000-0000-4000-a000-000000000002');
INSERT INTO "Voice" (id,"displayId","reporterId",visibility,area,"reporterDepartment","locationDetail",title,detail,category,severity,status,"routeOwnerId","currentHandlerId","handlerType","anonymousAlias","updatedAt") VALUES
('40000000-0000-4000-a000-000000000001','CARE-202608-000001','20000000-0000-4000-a000-000000000001','GENERAL','KARAWANG_1','Department A','Line 1','General','Detail','WORK_DIFFICULTY','HIGH','IN_PROGRESS','20000000-0000-4000-a000-000000000002','20000000-0000-4000-a000-000000000003','SECTION_HEAD','Reporter-A',now()),
('40000000-0000-4000-a000-000000000002','CARE-202608-000002','20000000-0000-4000-a000-000000000001','PRIVATE','KARAWANG_1','Department A','Line 2','Private','Detail',NULL,'CRITICAL','OPEN','20000000-0000-4000-a000-000000000004',NULL,'UNION','Reporter-B',now()),
('40000000-0000-4000-a000-000000000003','CARE-202608-000003','20000000-0000-4000-a000-000000000001','GENERAL','KARAWANG_1','Department A','Line 3','Closed','Detail','SAFETY','LOW','CLOSED','20000000-0000-4000-a000-000000000002',NULL,'MANAGER','Reporter-C',now());
INSERT INTO "VoiceAssignment" (id,"voiceId","handlerId","handlerType","actorId") VALUES ('50000000-0000-4000-a000-000000000001','40000000-0000-4000-a000-000000000001','20000000-0000-4000-a000-000000000003','SECTION_HEAD','20000000-0000-4000-a000-000000000002');
INSERT INTO "VoiceEvent" (id,"voiceId",type,"actorId","actorRole",payload) VALUES ('50000000-0000-4000-a000-000000000002','40000000-0000-4000-a000-000000000001','ASSIGNED','20000000-0000-4000-a000-000000000002','MANAGER','{}');
INSERT INTO "Conversation" (id,"voiceId") VALUES ('50000000-0000-4000-a000-000000000003','40000000-0000-4000-a000-000000000002');
INSERT INTO "Message" (id,"conversationId","senderId","senderRole",text) VALUES ('50000000-0000-4000-a000-000000000004','50000000-0000-4000-a000-000000000003','20000000-0000-4000-a000-000000000001','MEMBER','Historical private message');
INSERT INTO "AIClassification" (id,"voiceId",model,location,"promptVersion",source,category,severity,confidence,"rationaleCode","contentHash") VALUES ('50000000-0000-4000-a000-000000000005','40000000-0000-4000-a000-000000000001','gemini-legacy','global','v1','AI','WORK_DIFFICULTY','HIGH',0.9,'WORK_PROCESS',repeat('a',64));
INSERT INTO "ClosureCycle" (id,"voiceId","cycleNumber","actorId",note) VALUES ('50000000-0000-4000-a000-000000000006','40000000-0000-4000-a000-000000000003',1,'20000000-0000-4000-a000-000000000002','Done');
INSERT INTO "Rating" (id,"closureCycleId","reporterId",score) VALUES ('50000000-0000-4000-a000-000000000007','50000000-0000-4000-a000-000000000006','20000000-0000-4000-a000-000000000001',5);
INSERT INTO "Notification" (id,"recipientId","voiceId",type,title,body) VALUES ('50000000-0000-4000-a000-000000000008','20000000-0000-4000-a000-000000000001','40000000-0000-4000-a000-000000000003','CLOSED','Closed','Closed');
`,
);
psql(
  database,
  readFileSync(
    resolve(
      repository,
      'apps/api/prisma/migrations/20260825090000_v11_backend_remediation/migration.sql',
    ),
    'utf8',
  ),
);
const result = JSON.parse(
  psql(
    database,
    `SELECT json_build_object(
      'voices',(SELECT count(*) FROM "Voice"),
      'assignments',(SELECT count(*) FROM "VoiceAssignment"),
      'events',(SELECT count(*) FROM "VoiceEvent"),
      'messages',(SELECT count(*) FROM "Message"),
      'closures',(SELECT count(*) FROM "ClosureCycle"),
      'ratings',(SELECT count(*) FROM "Rating"),
      'notifications',(SELECT count(*) FROM "Notification"),
      'privateConsent',(SELECT "showReporterIdentity" FROM "Voice" WHERE id='40000000-0000-4000-a000-000000000002'),
      'unionStatus',(SELECT status::text FROM "UserAccount" WHERE id='20000000-0000-4000-a000-000000000004'),
      'legacyAccess',(SELECT count(*) FROM "LegacyVoiceAccess"),
      'routeSnapshots',(SELECT count(*) FROM "Voice" WHERE "routeMappingId" IS NOT NULL),
      'actorSnapshot',(SELECT "actorAccountKind"::text FROM "VoiceEvent" WHERE id='50000000-0000-4000-a000-000000000002'),
      'legacyLocation',(SELECT "legacyProviderMetadata"->>'location' FROM "AIClassification" WHERE id='50000000-0000-4000-a000-000000000005')
    );`,
  ),
);
const expected = {
  voices: 3,
  assignments: 1,
  events: 1,
  messages: 1,
  closures: 1,
  ratings: 1,
  notifications: 1,
  privateConsent: false,
  unionStatus: 'LEGACY_HANDLER',
  legacyAccess: 3,
  routeSnapshots: 3,
  actorSnapshot: 'WORKFORCE',
  legacyLocation: 'global',
};
for (const [key, value] of Object.entries(expected))
  if (result[key] !== value)
    throw new Error(`Upgrade reconciliation failed for ${key}: ${JSON.stringify(result)}`);
process.stdout.write(`Migration upgrade reconciliation passed: ${JSON.stringify(result)}\n`);
