import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import webpush from 'web-push';

async function main() {
  const stdout = process.argv.includes('--stdout');
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if ((stdout && output) || (!stdout && !output)) {
    process.stderr.write('Select exactly one secure destination: --stdout or --output <path>\n');
    process.exitCode = 2;
    return;
  }
  const keys = webpush.generateVAPIDKeys();
  const value = `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
  if (stdout) process.stdout.write(value);
  else
    await writeFile(resolve(output!), value, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
}
void main();
