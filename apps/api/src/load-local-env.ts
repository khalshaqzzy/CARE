import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

let loaded = false;

/** Load the nearest ignored local .env without replacing values supplied by the operator. */
export function loadLocalEnv(): void {
  if (loaded) return;
  loaded = true;

  const explicit = process.env.CARE_ENV_FILE?.trim();
  const candidates = [
    explicit ? resolve(explicit) : undefined,
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    loadEnvFile(candidate);
    return;
  }
}
