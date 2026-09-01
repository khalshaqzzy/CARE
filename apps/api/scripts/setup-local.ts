import { randomBytes } from 'node:crypto';
import { lstat, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import webpush from 'web-push';
import ExcelJS from 'exceljs';

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
  const organizationPath = resolve(dataRoot, 'organization.xlsx');
  const remediationPath = resolve(dataRoot, 'admin-remediation.json');
  const credentialPath = resolve(dataRoot, 'LOCAL_CREDENTIALS.txt');
  const targets = [envPath, apiEnvPath, organizationPath, remediationPath, credentialPath];
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
    'OPENAI_API_KEY=',
    `OPENAI_CONFIG_ENCRYPTION_KEY=${secret(32)}`,
    'OPENAI_MODEL=',
    'OPENAI_BASE_URL=',
    'OPENAI_REASONING_EFFORT=',
    'OPENAI_CONFIDENCE_THRESHOLD=0.75',
    'OPENAI_TIMEOUT_MS=30000',
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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('MFG + QD');
  sheet.addRow([
    'Noreg',
    'Nama',
    'Posisi (struktural)',
    'Directorat',
    'Division',
    'Department',
    'Section',
  ]);
  sheet.addRows([
    [
      '000001',
      'Local Member',
      'Member',
      'Manufacturing',
      'Production Division',
      'Production Department',
      'Assembly',
    ],
    [
      '000002',
      'Local Department Head',
      'Department Head',
      'Manufacturing',
      'Production Division',
      'Production Department',
      'Management',
    ],
    [
      '000003',
      'Local Section Head',
      'Section Head',
      'Manufacturing',
      'Production Division',
      'Production Department',
      'Assembly',
    ],
    [
      '000014',
      'Local Department 14 Member',
      'Member',
      'Manufacturing',
      'Production Division',
      '14',
      'Unrouted',
    ],
  ]);

  const credentials = [
    'CARE LOCAL CREDENTIALS - DO NOT COMMIT',
    '',
    'Admin',
    '  username: care-admin',
    `  password: ${adminPassword}`,
    '',
    'Imported workforce accounts',
    '  username: each Noreg from organization.xlsx',
    '  initial password: same value as no_reg',
    '  password change is required on first login',
    '',
    'Union slots (provision through Admin API using admin-remediation.json)',
    '  care-union-head / care-union-1 / care-union-2',
    '  initial password: same as username',
    '  password change is required on first login',
    '',
  ].join('\n');

  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await writeFile(envPath, env, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await symlink('../../.env', apiEnvPath);
  await workbook.xlsx.writeFile(organizationPath);
  await writeFile(
    remediationPath,
    `${JSON.stringify(
      {
        unionAccounts: [
          { slot: 'HEAD', username: 'care-union-head', displayName: 'Local Union Head' },
          { slot: 'OFFICER_1', username: 'care-union-1', displayName: 'Local Union Officer 1' },
          { slot: 'OFFICER_2', username: 'care-union-2', displayName: 'Local Union Officer 2' },
        ],
        globalPicNoReg: '000002',
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  await writeFile(credentialPath, credentials, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });

  process.stdout.write(
    'Local environment, synthetic XLSX, and Admin remediation data created. OpenAI config is optional until live smoke.\n',
  );
}

void main();
