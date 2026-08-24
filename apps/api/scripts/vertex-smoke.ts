import { AiService } from '../src/ai/ai.service';
import { loadConfig } from '../src/config';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://care:care_local@localhost:54329/care_test';
process.env.SESSION_HASH_SECRET ??= 'smoke-session-hash-secret-32-characters';
process.env.SESSION_CSRF_SECRET ??= 'smoke-session-csrf-secret-32-characters';
process.env.AUTH_THROTTLE_SECRET ??= 'smoke-auth-throttle-secret-32-characters';
process.env.CURSOR_SIGNING_SECRET ??= 'smoke-cursor-signing-secret-32-characters';

async function main() {
  if (!process.env.VERTEX_API_KEY) {
    process.stderr.write('VERTEX_API_KEY must be supplied by the runtime secret environment\n');
    process.exitCode = 2;
    return;
  }
  const result = await new AiService().classify({
    area: 'KARAWANG_1',
    department: 'Production Engineering',
    title: 'Usulan label informasi',
    detail: 'Mohon tambahkan label yang lebih jelas pada rak alat bersama.',
  });
  const structured = result.source === 'AI' || Boolean(result.candidate);
  if (!structured) throw new Error(`Vertex smoke failed: ${result.fallbackCode}`);
  const config = loadConfig();
  process.stdout.write(
    `${JSON.stringify({ status: 'ok', provider: 'vertex-ai', model: config.VERTEX_MODEL, location: config.VERTEX_LOCATION, structured: true })}\n`,
  );
}
void main();
