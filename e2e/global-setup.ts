import { execSync } from 'node:child_process';

/**
 * Seed the disposable PostgreSQL with a deterministic Admin e2e baseline before
 * any test runs, but only when the gated full-stack project is enabled. The
 * default mocked `test:frontend:e2e` run never touches a database.
 */
export default function globalSetup() {
  if (process.env.FULLSTACK_E2E !== '1') return;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    E2E_ADMIN_USERNAME: process.env.E2E_ADMIN_USERNAME ?? 'e2e-admin',
    E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-1',
  };
  try {
    execSync('pnpm --filter @care/api seed:admin:e2e', {
      stdio: 'inherit',
      env,
      cwd: process.env.INIT_CWD ?? process.cwd(),
    });
  } catch (cause) {
    throw new Error(
      `Failed to seed the Admin e2e database (set NODE_ENV=test + DATABASE_URL): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
}
