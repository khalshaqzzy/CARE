import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApp } from '../src/bootstrap';
import { enrichOpenApi } from './enrich-openapi';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://care:care_local@localhost:54329/care_test';
process.env.SESSION_HASH_SECRET ??= 'test-session-hash-secret-32-characters';
process.env.SESSION_CSRF_SECRET ??= 'test-session-csrf-secret-32-characters';
process.env.AUTH_THROTTLE_SECRET ??= 'test-auth-throttle-secret-32-characters';
process.env.CURSOR_SIGNING_SECRET ??= 'test-cursor-signing-secret-32-chars';

async function main() {
  const app = await createApp();
  const config = new DocumentBuilder()
    .setTitle('CARE API')
    .setVersion('1.1.0')
    .addCookieAuth('care_session', { type: 'apiKey', in: 'cookie', name: 'care_session' }, 'cookie')
    .build();
  const document = enrichOpenApi(SwaggerModule.createDocument(app, config));
  await writeFile(
    resolve(process.cwd(), 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    { mode: 0o644 },
  );
  await app.close();
}
void main();
