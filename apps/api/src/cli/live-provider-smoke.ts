import { loadConfig } from '../config';
import { VoiceVisibility } from '@prisma/client';
import { AiService } from '../ai/ai.service';

function say(message: string) {
  process.stdout.write(`[live-provider-smoke] ${message}\n`);
}

async function main() {
  const config = loadConfig();
  const configured = Boolean(
    config.OPENAI_API_KEY && config.OPENAI_MODEL && config.OPENAI_BASE_URL,
  );
  say(`provider configured=${configured}`);
  say(
    `provider config model=${config.OPENAI_MODEL || '(unset)'} baseUrl=${config.OPENAI_BASE_URL || '(unset)'} reasoningEffort=${config.OPENAI_REASONING_EFFORT} timeoutMs=${config.OPENAI_TIMEOUT_MS} confidenceThreshold=${config.OPENAI_CONFIDENCE_THRESHOLD}`,
  );
  // The API key is intentionally never logged.

  const ai = new AiService();

  const classification = await ai.classify({
    visibility: VoiceVisibility.GENERAL,
    area: 'KARAWANG_1',
    title: 'Pelindung mesin produksi terlepas',
    detail: 'Pelindung mesin terlepas dan berpotensi mengenai operator saat mesin dijalankan.',
  });
  if (classification.source === 'AI') {
    say(
      `classification source=AI category=${classification.result.category} severity=${classification.result.severity} confidence=${classification.result.confidence} model=${classification.model} promptVersion=${classification.promptVersion} latencyMs=${classification.latencyMs}`,
    );
  } else {
    const detail =
      'errorDetail' in classification && classification.errorDetail
        ? ` errorDetail=${classification.errorDetail}`
        : '';
    const candidate =
      'candidate' in classification && classification.candidate
        ? ` candidate=${JSON.stringify(classification.candidate)}`
        : '';
    say(
      `classification source=MANUAL_FALLBACK fallbackCode=${classification.fallbackCode} latencyMs=${classification.latencyMs}${detail}${candidate}`,
    );
  }
  const classificationValid =
    classification.source === 'AI' ||
    (classification.fallbackCode === 'LOW_CONFIDENCE' && Boolean(classification.candidate));
  if (!classificationValid)
    throw new Error(
      `Live classification contract validation failed (fallbackCode=${classification.fallbackCode})`,
    );

  const location = await ai.reviewLocation({
    area: 'KARAWANG_1',
    locationDetail: 'Gedung Produksi A, line 2, mesin press nomor 4',
  });
  say(
    `location review fallbackCode=${location.fallbackCode ?? 'none'} completeness=${location.completeness} latencyMs=${location.latencyMs}`,
  );
  if (location.fallbackCode)
    throw new Error(
      `Live location contract validation failed (fallbackCode=${location.fallbackCode})`,
    );
  say('Live OpenAI-compatible Chat Completions classification and location contracts passed');
}

void main();
