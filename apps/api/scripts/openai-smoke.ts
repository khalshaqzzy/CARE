import { createServer } from 'node:http';
import { AiService } from '../src/ai/ai.service';
import { resetConfigForTests } from '../src/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://care:care_local@localhost:54329/care_test';
process.env.SESSION_HASH_SECRET ??= 'smoke-session-hash-secret-32-characters';
process.env.SESSION_CSRF_SECRET ??= 'smoke-session-csrf-secret-32-characters';
process.env.AUTH_THROTTLE_SECRET ??= 'smoke-auth-throttle-secret-32-characters';
process.env.CURSOR_SIGNING_SECRET ??= 'smoke-cursor-signing-secret-32-characters';

async function main() {
  let sequence = 0;
  const requests: Array<{ path: string | undefined; body: Record<string, unknown> }> = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += String(chunk)));
    request.on('end', () => {
      const body = JSON.parse(raw) as {
        model: string;
        store: boolean;
        text: { format: { name: string; strict: boolean } };
      };
      requests.push({ path: request.url, body: body as unknown as Record<string, unknown> });
      sequence += 1;
      const value =
        body.text.format.name === 'care_location_review'
          ? { completeness: 'COMPLETE', warning: null, questions: [] }
          : {
              category: 'ENVIRONMENT',
              severity: 'MEDIUM',
              confidence: 0.92,
              rationaleCode: 'ENVIRONMENTAL_RISK',
            };
      response.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': `mock-request-${sequence}`,
      });
      response.end(
        JSON.stringify({
          id: `resp_mock_${sequence}`,
          object: 'response',
          created_at: 1,
          status: 'completed',
          model: body.model,
          output: [
            {
              id: `msg_mock_${sequence}`,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Mock server address missing');
    Object.assign(process.env, {
      OPENAI_API_KEY: 'local-mock-credential-not-a-real-api-key',
      OPENAI_MODEL: 'care-mock-responses-model',
      OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    });
    resetConfigForTests();
    const service = new AiService();
    const [classification, location] = await Promise.all([
      service.classify({
        visibility: 'GENERAL',
        area: 'KARAWANG_1',
        title: 'Usulan label informasi',
        detail: 'Mohon tambahkan label yang lebih jelas pada rak alat bersama.',
      }),
      service.reviewLocation({
        area: 'KARAWANG_1',
        locationDetail: 'Gedung A, dekat pintu masuk line satu',
      }),
    ]);
    if (classification.source !== 'AI' || location.completeness !== 'COMPLETE')
      throw new Error('Mock Responses smoke did not return both valid schemas');
    if (
      requests.length !== 2 ||
      requests.some(
        ({ path, body }) =>
          path !== '/v1/responses' ||
          body.store !== false ||
          'tools' in body ||
          'conversation' in body,
      )
    )
      throw new Error('Mock Responses smoke observed an invalid request contract');
    process.stdout.write(
      `${JSON.stringify({
        status: 'ok',
        provider: 'mock-openai-responses',
        model: 'care-mock-responses-model',
        schemas: ['classification', 'location'],
        requestIds: [classification.responseId, location.responseId],
      })}\n`,
    );
  } finally {
    resetConfigForTests();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
void main();
