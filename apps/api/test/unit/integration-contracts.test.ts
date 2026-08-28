import ExcelJS from 'exceljs';
import { createServer } from 'node:http';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { AiService } from '../../src/ai/ai.service';
import { resetConfigForTests } from '../../src/config';
import { ImportsService, ORGANIZATION_HEADERS } from '../../src/imports/imports.service';

afterEach(() => {
  for (const key of [
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_BASE_URL',
    'OPENAI_REASONING_EFFORT',
    'OPENAI_TIMEOUT_MS',
  ])
    delete process.env[key];
  resetConfigForTests();
});

async function workbook(values: unknown[], headers: readonly string[] = ORGANIZATION_HEADERS) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('MFG + QD');
  sheet.addRow([...headers]);
  sheet.addRow(values);
  return Buffer.from(await book.xlsx.writeBuffer());
}

function adversarialZipEntry(content: Buffer, declaredSize: number) {
  const name = Buffer.from('xl/sharedStrings.xml');
  const compressed = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declaredSize, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

describe('XLSX import contract', () => {
  const service = new ImportsService({} as never);
  it('preserves a leading-zero Noreg and exact seven-column organization identity', async () => {
    const rows = await service.parse(
      await workbook([
        '000123',
        'Employee',
        'Section Head',
        'Manufacturing',
        'Division A',
        'Maintenance Dept',
        'Section 1',
      ]),
    );
    expect(rows[0]).toMatchObject({
      noReg: '000123',
      structuralPosition: 'Section Head',
      directorate: 'Manufacturing',
      division: 'Division A',
      department: 'Maintenance Dept',
    });
  });
  it('rejects numeric Noreg and non-exact headers', async () => {
    await expect(
      service.parse(await workbook([123, 'Employee', 'Member', 'D', 'V', 'Dept', 'S'])),
    ).rejects.toMatchObject({ code: 'XLSX_CELL_TYPE_INVALID' });
    await expect(
      service.parse(
        await workbook(
          ['000123', 'Employee', 'Member', 'D', 'V', 'Dept', 'S'],
          ['NoReg', ...ORGANIZATION_HEADERS.slice(1)],
        ),
      ),
    ).rejects.toMatchObject({ code: 'XLSX_HEADERS_INVALID' });
  });
  it('rejects an empty authoritative snapshot and an eighth header', async () => {
    const empty = new ExcelJS.Workbook();
    empty.addWorksheet('MFG + QD').addRow([...ORGANIZATION_HEADERS]);
    await expect(service.parse(Buffer.from(await empty.xlsx.writeBuffer()))).rejects.toMatchObject({
      code: 'XLSX_EMPTY',
    });
    await expect(
      service.parse(
        await workbook(
          ['000123', 'Employee', 'Member', 'D', 'V', 'Dept', 'S'],
          [...ORGANIZATION_HEADERS, 'Unexpected'],
        ),
      ),
    ).rejects.toMatchObject({ code: 'XLSX_HEADERS_INVALID' });
  });
  it('normalizes the workbook blank-department sentinel to exact Department 14', async () => {
    const rows = await service.parse(
      await workbook(['000014', 'Director', 'Director', 'Manufacturing', '', '', '']),
    );
    expect(rows[0]).toMatchObject({ division: '', department: '14', section: '' });
  });
  it('rejects a compressed entry whose actual expansion exceeds the XLSX safety limit', async () => {
    const archive = adversarialZipEntry(Buffer.alloc(21 * 1024 * 1024, 65), 1);
    await expect(service.parse(archive)).rejects.toMatchObject({ code: 'XLSX_ARCHIVE_LIMIT' });
  });
  it('returns a stable validation error for a truncated XLSX archive', async () => {
    await expect(service.parse(Buffer.from([0x50, 0x4b]))).rejects.toMatchObject({
      code: 'XLSX_INVALID',
    });
  });
});

describe('CSV import contract', () => {
  const service = new ImportsService({} as never);
  it('preserves leading zeroes and quoted commas with the same seven-column contract', async () => {
    const csv = Buffer.from(
      `\uFEFF${ORGANIZATION_HEADERS.join(',')}\r\n000123,"Employee, One",Section Head,Manufacturing,Division A,Maintenance Dept,Section 1\r\n`,
      'utf8',
    );
    await expect(service.parse(csv, 'csv')).resolves.toEqual([
      expect.objectContaining({
        noReg: '000123',
        name: 'Employee, One',
        structuralPosition: 'Section Head',
        department: 'Maintenance Dept',
      }),
    ]);
  });

  it('rejects invalid headers, duplicate Noreg, and malformed column counts', async () => {
    await expect(
      service.parse(Buffer.from(`NoReg,${ORGANIZATION_HEADERS.slice(1).join(',')}\n`), 'csv'),
    ).rejects.toMatchObject({ code: 'CSV_HEADERS_INVALID' });
    await expect(
      service.parse(
        Buffer.from(
          `${ORGANIZATION_HEADERS.join(',')}\n000001,A,Member,D,V,Dept,S\n000001,B,Member,D,V,Dept,S\n`,
        ),
        'csv',
      ),
    ).rejects.toMatchObject({ code: 'CSV_DUPLICATE_NOREG' });
    await expect(
      service.parse(
        Buffer.from(`${ORGANIZATION_HEADERS.join(',')}\n000001,A,Member,D,V,Dept\n`),
        'csv',
      ),
    ).rejects.toMatchObject({ code: 'CSV_INVALID' });
    await expect(service.parse(Buffer.from([0xff, 0xfe, 0xfd]), 'csv')).rejects.toMatchObject({
      code: 'CSV_INVALID',
    });
  });
});

describe('DeepSeek Chat Completions adapter', () => {
  it('uses non-thinking named function calls and separate classification/location schemas', async () => {
    const requests: any[] = [];
    const server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        const body = JSON.parse(raw);
        requests.push({ url: request.url, body });
        const tool = body.tools[0].function;
        const location = tool.name === 'submit_care_location_review';
        const value = location
          ? {
              completeness: 'INCOMPLETE',
              warning: 'Lokasi belum rinci',
              questions: ['Di gedung atau line mana?'],
            }
          : {
              category: 'ENVIRONMENT',
              severity: 'HIGH',
              confidence: 0.91,
              rationaleCode: 'ENVIRONMENTAL_RISK',
            };
        response.writeHead(200, {
          'content-type': 'application/json',
          'x-request-id': 'safe-request',
        });
        response.end(
          JSON.stringify({
            id: `chatcmpl_${requests.length}`,
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: { name: tool.name, arguments: JSON.stringify(value) },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server address missing');
      Object.assign(process.env, {
        OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
        OPENAI_MODEL: 'test-model',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        OPENAI_REASONING_EFFORT: 'none',
      });
      resetConfigForTests();
      const service = new AiService();
      const classification = await service.classify({
        visibility: 'GENERAL',
        area: 'KARAWANG_1',
        title: 'Limbah bocor',
        detail: 'Ada kebocoran cairan di area proses',
      });
      const location = await service.reviewLocation({
        area: 'KARAWANG_1',
        locationDetail: 'dekat line',
      });
      expect(classification).toMatchObject({ source: 'AI', result: { category: 'ENVIRONMENT' } });
      expect(location).toMatchObject({ completeness: 'INCOMPLETE' });
      expect(requests).toHaveLength(2);
      for (const item of requests) {
        expect(item.url).toBe('/v1/chat/completions');
        expect(item.body.thinking).toEqual({ type: 'disabled' });
        expect(item.body.reasoning_effort).toBeUndefined();
        expect(item.body.messages).toHaveLength(2);
        expect(item.body.messages[0].role).toBe('system');
        expect(item.body.messages[1].content).toContain('untrusted CARE report data');
        expect(item.body.tools).toHaveLength(1);
        expect(item.body.tools[0].function.strict).toBeUndefined();
        expect(item.body.tool_choice).toEqual({
          type: 'function',
          function: { name: item.body.tools[0].function.name },
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('retries one 429, accepts Private severity with null category, and never retries schema output', async () => {
    let requests = 0;
    const server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        requests += 1;
        if (requests === 1) {
          response.writeHead(429, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ error: { message: 'rate limited', type: 'rate_limit_error' } }),
          );
          return;
        }
        const body = JSON.parse(raw);
        const value = {
          category: null,
          severity: 'CRITICAL',
          confidence: 0.95,
          rationaleCode: 'PEOPLE_ISSUE',
        };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'chatcmpl_private',
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_private',
                      type: 'function',
                      function: {
                        name: body.tools[0].function.name,
                        arguments: JSON.stringify(value),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server address missing');
      Object.assign(process.env, {
        OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
        OPENAI_MODEL: 'test-model',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      });
      resetConfigForTests();
      const result = await new AiService().classify({
        visibility: 'PRIVATE',
        title: 'Private concern',
        detail: 'Sensitive workplace concern without identity data',
      });
      expect(result).toMatchObject({
        source: 'AI',
        result: { category: null, severity: 'CRITICAL' },
      });
      expect(requests).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each([
    ['length', undefined, 'INCOMPLETE'],
    ['content_filter', undefined, 'INCOMPLETE'],
    ['insufficient_system_resource', undefined, 'INCOMPLETE'],
    ['stop', undefined, 'EMPTY_OUTPUT'],
    ['tool_calls', [], 'INVALID_SCHEMA'],
    [
      'tool_calls',
      [
        {
          id: 'wrong',
          type: 'function',
          function: { name: 'unexpected_tool', arguments: '{}' },
        },
      ],
      'INVALID_SCHEMA',
    ],
    [
      'tool_calls',
      [
        {
          id: 'duplicate-1',
          type: 'function',
          function: { name: 'submit_care_classification', arguments: '{}' },
        },
        {
          id: 'duplicate-2',
          type: 'function',
          function: { name: 'submit_care_classification', arguments: '{}' },
        },
      ],
      'INVALID_SCHEMA',
    ],
    [
      'tool_calls',
      [
        {
          id: 'malformed',
          type: 'function',
          function: { name: 'submit_care_classification', arguments: '{not-json' },
        },
      ],
      'INVALID_SCHEMA',
    ],
    [
      'tool_calls',
      [
        {
          id: 'invalid-domain',
          type: 'function',
          function: {
            name: 'submit_care_classification',
            arguments: JSON.stringify({
              category: 'NOT_ALLOWED',
              severity: 'HIGH',
              confidence: 0.9,
              rationaleCode: 'AMBIGUOUS',
            }),
          },
        },
      ],
      'INVALID_SCHEMA',
    ],
  ] as const)(
    'maps finish reason %s and malformed tool output to %s',
    async (finishReason, toolCalls, expectedFallback) => {
      let requests = 0;
      const server = createServer((request, response) => {
        request.resume();
        request.on('end', () => {
          requests += 1;
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              id: `chatcmpl_failure_${requests}`,
              object: 'chat.completion',
              created: 1,
              model: 'deepseek-v4-flash',
              choices: [
                {
                  index: 0,
                  finish_reason: finishReason,
                  message: {
                    role: 'assistant',
                    content: finishReason === 'stop' ? 'unexpected prose' : null,
                    ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
                  },
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Server address missing');
        Object.assign(process.env, {
          OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
          OPENAI_MODEL: 'deepseek-v4-flash',
          OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
          OPENAI_REASONING_EFFORT: 'none',
        });
        resetConfigForTests();
        const result = await new AiService().classify({
          visibility: 'GENERAL',
          area: 'KARAWANG_1',
          title: 'Test output contract',
          detail: 'Provider output must be rejected safely.',
        });
        expect(result).toMatchObject({
          source: 'MANUAL_FALLBACK',
          fallbackCode: expectedFallback,
        });
        expect(requests).toBe(1);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it('retries one provider 5xx and accepts the second function call', async () => {
    let requests = 0;
    const server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        requests += 1;
        if (requests === 1) {
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ error: { message: 'temporarily unavailable', type: 'server_error' } }),
          );
          return;
        }
        const body = JSON.parse(raw);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'chatcmpl_after_503',
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_after_503',
                      type: 'function',
                      function: {
                        name: body.tools[0].function.name,
                        arguments: JSON.stringify({
                          category: 'FACILITY',
                          severity: 'MEDIUM',
                          confidence: 0.88,
                          rationaleCode: 'FACILITY_ISSUE',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server address missing');
      Object.assign(process.env, {
        OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
        OPENAI_MODEL: 'deepseek-v4-flash',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        OPENAI_REASONING_EFFORT: 'none',
      });
      resetConfigForTests();
      const result = await new AiService().classify({
        visibility: 'GENERAL',
        area: 'KARAWANG_1',
        title: 'Lampu area rusak',
        detail: 'Lampu lorong produksi tidak menyala.',
      });
      expect(result).toMatchObject({ source: 'AI', result: { category: 'FACILITY' } });
      expect(requests).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('retries one timeout and then returns a sanitized timeout fallback', async () => {
    let requests = 0;
    const server = createServer((request) => {
      requests += 1;
      request.resume();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server address missing');
      Object.assign(process.env, {
        OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
        OPENAI_MODEL: 'deepseek-v4-flash',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        OPENAI_REASONING_EFFORT: 'none',
        OPENAI_TIMEOUT_MS: '1000',
      });
      resetConfigForTests();
      const result = await new AiService().classify({
        visibility: 'GENERAL',
        area: 'KARAWANG_1',
        title: 'Timeout fixture',
        detail: 'The provider does not answer this non-sensitive fixture.',
      });
      expect(result).toMatchObject({ source: 'MANUAL_FALLBACK', fallbackCode: 'TIMEOUT' });
      expect(JSON.stringify(result)).not.toContain('test-openai-key');
      expect(requests).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
