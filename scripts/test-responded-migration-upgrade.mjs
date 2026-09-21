import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();
const database = 'care_responded_upgrade_test';
const latest = '20260921090000_responded_targets';

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
SELECT ('92000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'RESPONSE-UPGRADE-' || n,
'91000000-0000-4000-8000-000000000001','GENERAL','KARAWANG_1','001','Reporter','Division','Department','Line','Title','Historical','HIGH',
(CASE WHEN n=1 THEN 'OPEN' WHEN n=2 THEN 'MONITORED' WHEN n=3 THEN 'IN_PROGRESS' ELSE 'CLOSED' END)::"VoiceStatus",
'91000000-0000-4000-8000-000000000002','MANAGER','Alias-' || n,'2026-09-01' FROM generate_series(1,4) n;
INSERT INTO "VoiceEvent" (id,"voiceId",type,"actorId","actorAccountKind","actorCapabilities",payload)
SELECT gen_random_uuid(),id,'MONITORED','91000000-0000-4000-8000-000000000002','WORKFORCE','["MANAGER"]','{"via":"ASSIGNMENT"}' FROM "Voice" WHERE status='MONITORED';
INSERT INTO "Conversation" (id,"voiceId") SELECT gen_random_uuid(),id FROM "Voice" WHERE status='IN_PROGRESS';
INSERT INTO "Message" (id,"conversationId","senderId","senderAccountKind","senderCapabilities",text)
SELECT gen_random_uuid(),id,'91000000-0000-4000-8000-000000000002','WORKFORCE','["MANAGER"]','Historical note' FROM "Conversation";
`,
  );
  const history = `SELECT json_build_object('events',(SELECT json_agg(e ORDER BY id) FROM "VoiceEvent" e),'timestamps',(SELECT json_agg(v."updatedAt" ORDER BY id) FROM "Voice" v),'messages',(SELECT json_agg(json_build_object('id',m.id,'text',m.text,'createdAt',m."createdAt")) FROM "Message" m))`;
  const before = psql(database, history);
  psql(database, readFileSync(resolve(migrationRoot, latest, 'migration.sql'), 'utf8'));
  if (psql(database, history) !== before)
    throw new Error('Historical messages/events/timestamps changed');
  const rows = JSON.parse(
    psql(
      database,
      `SELECT json_agg(json_build_object('status',v.status,'version',v.version,'room',c.id IS NOT NULL) ORDER BY v."displayId") FROM "Voice" v LEFT JOIN "Conversation" c ON c."voiceId"=v.id`,
    ),
  );
  if (rows.map((row) => row.status).join(',') !== 'OPEN,RESPONDED,IN_PROGRESS,CLOSED')
    throw new Error('Status mapping invalid');
  if (!rows[1].room || rows[1].version !== 2 || rows[0].room)
    throw new Error('Response room/version invalid');
  if (psql(database, 'SELECT count(*) FROM "Message"') !== '1')
    throw new Error('Synthetic message created');
  for (const table of ['Notification', 'VoiceHandlingTarget'])
    if (psql(database, `SELECT count(*) FROM "${table}"`) !== '0')
      throw new Error('Historical target or notification fabricated');
  process.stdout.write('Responded upgrade preserved history and opened only the eligible room.\n');
} finally {
  psql('postgres', `DROP DATABASE ${database} WITH (FORCE);`);
}
