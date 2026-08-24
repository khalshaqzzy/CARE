import { randomBytes } from 'node:crypto';
import { lstat, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import webpush from 'web-push';

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function secret(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

async function main() {
  const repositoryRoot = resolve(__dirname, '../../..');
  const envPath = resolve(repositoryRoot, '.env');
  const apiEnvPath = resolve(repositoryRoot, 'apps/api/.env');
  const dataRoot = resolve(repositoryRoot, 'local-data');
  const employeePath = resolve(dataRoot, 'employees.csv');
  const managerPath = resolve(dataRoot, 'managers.csv');
  const unionPath = resolve(dataRoot, 'union.json');
  const credentialPath = resolve(dataRoot, 'LOCAL_CREDENTIALS.txt');
  const targets = [envPath, apiEnvPath, employeePath, managerPath, unionPath, credentialPath];
  const existing = [] as string[];

  for (const target of targets) if (await pathExists(target)) existing.push(target);
  if (existing.length) {
    throw new Error(`Local setup refused to overwrite existing path(s): ${existing.join(', ')}`);
  }

  const vapid = webpush.generateVAPIDKeys();
  const adminPassword = `CARE-local-${secret(24)}`;
  const env = [
    'NODE_ENV=development',
    'PORT=3000',
    'DATABASE_URL=postgresql://care:care_local@localhost:54329/care',
    'MEDIA_ROOT=./media',
    'RELEASE_SHA=local-development',
    'SESSION_COOKIE_NAME=care_session',
    `SESSION_HASH_SECRET=${secret()}`,
    `SESSION_CSRF_SECRET=${secret()}`,
    `AUTH_THROTTLE_SECRET=${secret()}`,
    `CURSOR_SIGNING_SECRET=${secret()}`,
    'SESSION_IDLE_HOURS=8',
    'SESSION_ABSOLUTE_DAYS=7',
    'VERTEX_API_KEY=',
    'VERTEX_MODEL=gemini-3.7-flash',
    'VERTEX_LOCATION=global',
    'VERTEX_CONFIDENCE_THRESHOLD=0.75',
    'VERTEX_TIMEOUT_MS=10000',
    'VAPID_SUBJECT=mailto:care-local@example.invalid',
    `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
    `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
    'PUSH_ENDPOINT_HOSTS=fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com',
    `METRICS_TOKEN=${secret()}`,
    'OUTBOX_ENABLED=true',
    'CARE_ADMIN_USERNAME=care-admin',
    `CARE_ADMIN_PASSWORD=${adminPassword}`,
    '',
  ].join('\n');

  const employees = [
    'no_reg,name,division,department',
    'MEM001,Local Member,Manufacturing,Production',
    'MGR-PROD,Production Manager,Manufacturing,Production',
    'SAF-K1,Safety Manager Karawang 1,Manufacturing,Production',
    'SAF-K2,Safety Manager Karawang 2,Manufacturing,Production',
    'SAF-K3,Safety Manager Karawang 3,Manufacturing,Production',
    'SAF-S1,Safety Manager Sunter 1,Manufacturing,Production',
    'SAF-S2,Safety Manager Sunter 2,Manufacturing,Production',
    'FAC-K1,Facility Manager Karawang 1,Manufacturing,Production',
    'FAC-K2,Facility Manager Karawang 2,Manufacturing,Production',
    'FAC-K3,Facility Manager Karawang 3,Manufacturing,Production',
    'FAC-S1,Facility Manager Sunter 1,Manufacturing,Production',
    'FAC-S2,Facility Manager Sunter 2,Manufacturing,Production',
    '',
  ].join('\n');

  const managers = [
    'name,no_reg,division,department,area,is_safety,is_facility',
    'Production Manager,MGR-PROD,Manufacturing,Production,KARAWANG_1,0,0',
    'Safety Manager Karawang 1,SAF-K1,Manufacturing,Production,KARAWANG_1,1,0',
    'Safety Manager Karawang 2,SAF-K2,Manufacturing,Production,KARAWANG_2,1,0',
    'Safety Manager Karawang 3,SAF-K3,Manufacturing,Production,KARAWANG_3,1,0',
    'Safety Manager Sunter 1,SAF-S1,Manufacturing,Production,SUNTER_1,1,0',
    'Safety Manager Sunter 2,SAF-S2,Manufacturing,Production,SUNTER_2,1,0',
    'Facility Manager Karawang 1,FAC-K1,Manufacturing,Production,KARAWANG_1,0,1',
    'Facility Manager Karawang 2,FAC-K2,Manufacturing,Production,KARAWANG_2,0,1',
    'Facility Manager Karawang 3,FAC-K3,Manufacturing,Production,KARAWANG_3,0,1',
    'Facility Manager Sunter 1,FAC-S1,Manufacturing,Production,SUNTER_1,0,1',
    'Facility Manager Sunter 2,FAC-S2,Manufacturing,Production,SUNTER_2,0,1',
    '',
  ].join('\n');

  const credentials = [
    'CARE LOCAL CREDENTIALS - DO NOT COMMIT',
    '',
    'Admin',
    '  username: care-admin',
    `  password: ${adminPassword}`,
    '',
    'Imported workforce accounts',
    '  username: each no_reg from employees.csv',
    '  initial password: same value as no_reg',
    '  password change is required on first login',
    '',
    'Union',
    '  username: care-union',
    '  initial password: care-union',
    '  password change is required on first login',
    '',
  ].join('\n');

  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await writeFile(envPath, env, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await symlink('../../.env', apiEnvPath);
  await writeFile(employeePath, employees, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(managerPath, managers, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(
    unionPath,
    `${JSON.stringify({ username: 'care-union', display_name: 'Local Union' }, null, 2)}\n`,
    {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    },
  );
  await writeFile(credentialPath, credentials, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });

  process.stdout.write(
    'Local environment and synthetic account imports created. Fill VERTEX_API_KEY in .env.\n',
  );
}

void main();
