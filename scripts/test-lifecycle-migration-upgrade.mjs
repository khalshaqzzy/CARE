import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();
const database = 'care_lifecycle_upgrade_test';
const latest = '20260909100000_monitored_voice_lifecycle';

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
INSERT INTO "UserAccount" (id,username,"displayName","passwordHash","accountKind","updatedAt") VALUES
('91000000-0000-4000-8000-000000000001','reporter','Reporter','hash','WORKFORCE',now()),
('91000000-0000-4000-8000-000000000002','owner','Owner','hash','WORKFORCE',now());
INSERT INTO "Voice" (id,"displayId","reporterId",visibility,area,"reporterNoRegSnapshot","reporterNameSnapshot","reporterDivisionSnapshot","reporterDepartmentSnapshot","locationDetail",title,detail,severity,status,"routeOwnerId","handlerType","anonymousAlias","updatedAt")
SELECT ('92000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'UPGRADE-' || n,
'91000000-0000-4000-8000-000000000001','GENERAL','KARAWANG_1','001','Reporter','Division','Department','Line','Title','Historical','HIGH',
(CASE WHEN n=1 THEN 'OPEN' WHEN n IN (2,3,4,5) THEN 'IN_VERIFICATION' WHEN n=6 THEN 'IN_PROGRESS' ELSE 'CLOSED' END)::"VoiceStatus",
'91000000-0000-4000-8000-000000000002','MANAGER','Alias-' || n,'2026-09-01' FROM generate_series(1,7) n;
INSERT INTO "Conversation" (id,"voiceId") SELECT gen_random_uuid(),id FROM "Voice" WHERE "displayId" IN ('UPGRADE-3','UPGRADE-4');
INSERT INTO "Message" (id,"conversationId","senderId","senderAccountKind","senderCapabilities",text)
SELECT gen_random_uuid(),c.id,'91000000-0000-4000-8000-000000000002','WORKFORCE','["MANAGER"]',CASE WHEN v."displayId"='UPGRADE-3' THEN 'Historical message' ELSE NULL END
FROM "Conversation" c JOIN "Voice" v ON v.id=c."voiceId";
INSERT INTO "Attachment" (id,"messageId","uploaderId",purpose,state,"storageKey","mimeType",size,checksum)
SELECT gen_random_uuid(),m.id,'91000000-0000-4000-8000-000000000002','CHAT','REFERENCED','historical-attachment','image/webp',10,repeat('a',64)
FROM "Message" m WHERE m.text IS NULL;
INSERT INTO "ClosureCycle" (id,"voiceId","cycleNumber","actorId",note,"closedAt","reviewState","reviewDeadline")
SELECT gen_random_uuid(),id,1,'91000000-0000-4000-8000-000000000002','Historical resolution','2026-09-01','ACCEPTED','2026-09-03' FROM "Voice" WHERE "displayId"='UPGRADE-7';
INSERT INTO "Rating" (id,"closureCycleId","reporterId",score,reopen)
SELECT gen_random_uuid(),id,'91000000-0000-4000-8000-000000000001',5,false FROM "ClosureCycle";
INSERT INTO "IdempotencyRecord" (id,"accountId",scope,key,"requestHash","statusCode",response,"expiresAt")
VALUES (gen_random_uuid(),'91000000-0000-4000-8000-000000000002','assign:historical','historical-key',repeat('b',64),200,'{"status":"IN_VERIFICATION","version":2}',now()+interval '1 day');
INSERT INTO "VoiceEvent" (id,"voiceId",type,"actorId","actorAccountKind","actorCapabilities",payload)
SELECT gen_random_uuid(),id,'REOPENED','91000000-0000-4000-8000-000000000001','WORKFORCE','["MEMBER"]','{"score":1}' FROM "Voice" WHERE "displayId"='UPGRADE-5';
`,
  );
  const historic = `SELECT json_build_object('messages',(SELECT json_agg(m ORDER BY id) FROM "Message" m),'events',(SELECT json_agg(e ORDER BY id) FROM "VoiceEvent" e),'attachments',(SELECT json_agg(a ORDER BY id) FROM "Attachment" a),'closures',(SELECT json_agg(c ORDER BY id) FROM "ClosureCycle" c),'ratings',(SELECT json_agg(r ORDER BY id) FROM "Rating" r),'timestamps',(SELECT json_agg(v."updatedAt" ORDER BY id) FROM "Voice" v))`;
  const before = psql(database, historic);
  psql(database, readFileSync(resolve(migrationRoot, latest, 'migration.sql'), 'utf8'));
  if (psql(database, historic) !== before) throw new Error('Historical records changed');
  const rows = JSON.parse(
    psql(
      database,
      `SELECT json_agg(json_build_object('status',v.status,'version',v.version,'handler',v."currentHandlerId",'room',c.id IS NOT NULL) ORDER BY v."displayId") FROM "Voice" v LEFT JOIN "Conversation" c ON c."voiceId"=v.id`,
    ),
  );
  const replay = JSON.parse(psql(database, 'SELECT response FROM "IdempotencyRecord"'));
  if (replay.status !== 'MONITORED' || replay.version !== 2)
    throw new Error('Historical replay contract not normalized');
  const statuses = [
    'OPEN',
    'MONITORED',
    'IN_PROGRESS',
    'IN_PROGRESS',
    'IN_PROGRESS',
    'IN_PROGRESS',
    'CLOSED',
  ];
  rows.forEach((row, index) => {
    if (row.status !== statuses[index]) throw new Error('Incorrect migrated status ' + index);
    if (row.version !== (index > 0 && index < 6 ? 2 : 1))
      throw new Error('Incorrect version ' + index);
    if (row.status === 'IN_PROGRESS' && (!row.room || !row.handler))
      throw new Error('Missing conversation/handler ' + index);
  });
  if (psql(database, 'SELECT count(*) FROM "Notification"') !== '0')
    throw new Error('Migration sent notifications');
  process.stdout.write(
    'Lifecycle upgrade passed: historical records preserved, all seven cases reconciled.\n',
  );
} finally {
  psql('postgres', `DROP DATABASE ${database} WITH (FORCE);`);
}
